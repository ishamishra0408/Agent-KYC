import { parseReading, READER_PROMPT, READING_SCHEMA } from "../ai/documentReader";
import type { DocReading } from "../domain/types";
import { BudgetExceededError, OpenRouterError, type OpenRouter, type Usage } from "./openrouter";

// The AI document reader: one photo in, one DocReading out. The model sees only the photo, not
// which slot it was uploaded to and not what the driver typed, so it can't be steered into
// agreeing with either. What it may say is fixed by the schema; what it means is decided by the
// policy.

// The models in the comparison (D-035), all through OpenRouter.
export const AI_MODELS: Record<string, { id: string; label: string }> = {
  "claude-opus": { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5" },
  "claude-sonnet": { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
  "claude-haiku": { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
  qwen: { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (open-weight)" },
  gemma: { id: "google/gemma-4-31b-it", label: "Gemma 4 31B (open-weight)" },
  "qwen-free": { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B, free tier" },
};

export interface AiReading {
  reading: DocReading;
  usage: Usage;
  ms: number;
  answeredBy: string;
}

export function createAiReader(client: OpenRouter, model: string, opts: { providerSort?: "latency" | "throughput" | "price" } = {}) {
  return {
    model,
    async readImage(bytes: Buffer, mime = "image/jpeg", signal?: AbortSignal): Promise<AiReading> {
      const answer = await client.chatJson({
        model,
        system: READER_PROMPT,
        user: [
          { type: "text", text: "Read this document photo." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` } },
        ],
        schema: READING_SCHEMA,
        schemaName: "doc_reading",
        maxTokens: 3000, // room for models that think before answering (F-023)
        signal,
        providerSort: opts.providerSort,
      });
      return { reading: parseReading(answer.value), usage: answer.usage, ms: answer.ms, answeredBy: answer.model };
    },
  };
}

export type AiReader = ReturnType<typeof createAiReader>;

// The app's reader (D-038), chosen by the model comparison: Gemma 4 31B first, and Claude Sonnet
// when Gemma is slow or fails. Gemma answered in 8 to 13 s through OpenRouter on 29 Sep, so "slow"
// is 15 s, and its fastest provider is asked for first. Sonnet gets 30 s of its own, so a driver
// waits at most 45 s before being asked to try again. The evals measure this same chain
// (--reader=app), so what ships is what passed the gate.
export const APP_READER = { primary: AI_MODELS.gemma.id, fallback: AI_MODELS["claude-sonnet"].id, timeoutMs: 15_000, fallbackTimeoutMs: 30_000 } as const;

export interface ChainReading extends AiReading {
  fallback: string | null; // why the fallback model answered, or null when the primary did
}

export function createFallbackReader(client: OpenRouter, opts: { primary: string; fallback: string; timeoutMs: number; fallbackTimeoutMs: number }) {
  const primary = createAiReader(client, opts.primary, { providerSort: "latency" });
  const fallback = createAiReader(client, opts.fallback);
  return {
    model: `${opts.primary}, then ${opts.fallback}`,
    // `ms` counts from the start of the chain, the wait for a slow primary included: what the driver waits.
    async readImage(bytes: Buffer, mime = "image/jpeg"): Promise<ChainReading> {
      const started = Date.now();
      const slow = new AbortController();
      const timer = setTimeout(() => slow.abort(), opts.timeoutMs);
      try {
        return { ...(await primary.readImage(bytes, mime, slow.signal)), ms: Date.now() - started, fallback: null };
      } catch (err) {
        // No credit, a refused key or a spent budget fail the fallback the same way: don't try it.
        if (err instanceof BudgetExceededError || (err instanceof OpenRouterError && (err.status === 401 || err.status === 402))) throw err;
        const why = slow.signal.aborted ? `primary slower than ${opts.timeoutMs / 1000} s` : `primary failed: ${err instanceof Error ? err.message : String(err)}`;
        const deadline = AbortSignal.timeout(opts.fallbackTimeoutMs);
        try {
          return { ...(await fallback.readImage(bytes, mime, deadline)), ms: Date.now() - started, fallback: why.slice(0, 200) };
        } catch (err2) {
          if (deadline.aborted) throw new OpenRouterError(`${opts.fallback}: no answer within ${opts.fallbackTimeoutMs / 1000} s`, 0);
          throw err2;
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
