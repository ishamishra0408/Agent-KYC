// OpenRouter: one API for every model we use (D-033). This adapter does the I/O for the AI zone:
// it sends a prompt, an image and a JSON schema, and returns the parsed answer with its cost.
// It never logs the API key, and it stops at a spending budget.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface JsonAnswer {
  value: unknown;
  usage: Usage;
  model: string; // the model that actually answered
  ms: number;
}

export interface OpenRouterOptions {
  apiKey: string;
  budgetUsd: number; // stop before spending more than this in one run
  dataCollection?: "deny" | "allow"; // deny: only providers that don't store or train on prompts
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class BudgetExceededError extends Error {}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function explain(status: number, message: string): string {
  if (status === 401) return "OpenRouter refused the API key (401). Check OPENROUTER_API_KEY in .env.";
  if (status === 402) return "OpenRouter says the account has no credit for this model (402). Add credit, or use a :free model.";
  return `OpenRouter ${status}: ${message}`;
}

export function createOpenRouter(opts: OpenRouterOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 3;
  let spentUsd = 0;
  let calls = 0;
  let abandoned = 0; // sent, then cut off mid-answer: the provider may still bill these, unpriced here
  // Upstream text goes into errors and reports; the key must never ride along with it.
  const redact = (s: string) => (opts.apiKey ? s.split(opts.apiKey).join("[key]") : s);
  // A backoff ends as soon as the caller gives up, so a fallback isn't kept waiting behind it, and
  // its timer goes with it, so nothing keeps a finished run alive. opts.sleep replaces the timer in tests.
  const backoff = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      signal?.addEventListener("abort", done);
      if (opts.sleep) void opts.sleep(ms).then(done);
      else timer = setTimeout(done, ms);
    });

  async function chatJson(req: {
    model: string;
    system: string;
    user: ContentPart[];
    schema: object;
    schemaName: string;
    maxTokens?: number;
    signal?: AbortSignal; // the caller gives up (e.g. a slow primary model): no retry after that
    providerSort?: "latency" | "throughput" | "price"; // which of the model's providers OpenRouter tries first
  }): Promise<JsonAnswer> {
    if (spentUsd >= opts.budgetUsd) {
      throw new BudgetExceededError(`Spent $${spentUsd.toFixed(4)} of the $${opts.budgetUsd} budget; stopping.`);
    }
    const body = JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: 0,
      max_tokens: req.maxTokens ?? 800,
      response_format: { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
      provider: { require_parameters: true, data_collection: opts.dataCollection ?? "deny", ...(req.providerSort ? { sort: req.providerSort } : {}) },
      usage: { include: true },
    });

    for (let attempt = 0; ; attempt++) {
      if (req.signal?.aborted) throw new OpenRouterError(`${req.model}: cancelled by the caller`, 0);
      const started = Date.now();
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 90_000);
      let res: Response;
      let text: string;
      try {
        res = await fetchImpl(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", "X-Title": "Agent KYCReady" },
          body,
          signal: req.signal ? AbortSignal.any([timeout, req.signal]) : timeout,
        });
        // Inside the retry: OpenRouter sends headers at once and the answer when the model is done,
        // so a slow model times out here, while the body is still coming (F-024).
        text = await res.text();
      } catch (err) {
        if (req.signal?.aborted || (err instanceof Error && err.name === "TimeoutError")) abandoned++;
        if (req.signal?.aborted) throw new OpenRouterError(`${req.model}: cancelled by the caller`, 0);
        if (attempt < maxRetries) {
          await backoff(1000 * 2 ** attempt, req.signal);
          continue;
        }
        throw new OpenRouterError(redact(`OpenRouter request failed: ${err instanceof Error ? err.message : String(err)}`), 0);
      }
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        // not JSON: handled below by status
      }
      const errorMessage = (data.error as { message?: string } | undefined)?.message ?? text.slice(0, 200);
      if (!res.ok) {
        if (RETRYABLE.has(res.status) && attempt < maxRetries) {
          // A provider's rate limit outlasts a quick retry (F-024): back off 1, 2, 4 s, or as long
          // as the provider asks, up to 10 s.
          const asked = Number(res.headers.get("retry-after"));
          await backoff(Math.min(10_000, Number.isFinite(asked) && asked > 0 ? asked * 1000 : 1000 * 2 ** attempt), req.signal);
          continue;
        }
        throw new OpenRouterError(redact(explain(res.status, errorMessage)), res.status);
      }

      calls++;
      const usage = (data.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      const costUsd = typeof usage.cost === "number" ? usage.cost : 0;
      spentUsd += costUsd;
      const choice = (data.choices as { message?: { content?: unknown } }[] | undefined)?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string" || content.trim() === "") throw new OpenRouterError(`${req.model} returned no answer`, res.status);
      let value: unknown;
      try {
        value = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) throw new OpenRouterError(`${req.model} didn't return JSON`, res.status);
        value = JSON.parse(match[0]);
      }
      return {
        value,
        usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0, costUsd },
        model: typeof data.model === "string" ? data.model : req.model,
        ms: Date.now() - started,
      };
    }
  }

  return {
    chatJson,
    spent: () => ({ usd: spentUsd, calls, abandoned }),
  };
}

export type OpenRouter = ReturnType<typeof createOpenRouter>;
