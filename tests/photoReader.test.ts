import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFallbackReader } from "../server/adapters/aiReader";
import { createOpenRouter, OpenRouterError } from "../server/adapters/openrouter";
import { aiPhotoReader, type PhotoReader } from "../server/adapters/photoReader";
import { readSpecimen } from "../server/ai/simulatedReader";
import { Store } from "../server/db/store";
import { seedDemo } from "../server/demo/seed";
import { createWorld } from "../server/demo/world";
import { ManualClock } from "../server/domain/clock";
import { istAt } from "../server/domain/time";
import { consent, KycError, takePhoto, type KycContext } from "../server/services/kyc";

// The app's reader (D-038), offline: Gemma first, Sonnet when Gemma is slow or fails, and the photo
// step that records who read each photo.
const KEY = "sk-or-test-secret";
const GEMMA = "google/gemma-4-31b-it";
const SONNET = "anthropic/claude-sonnet-5.5";

const reading = {
  docType: "DL",
  quality: "ok",
  isScreenPhoto: false,
  suspiciousText: null,
  fields: { name: "RAMESH KUMAR", number: "KA01 20150004821", dob: null, validTill: null, holderName: null, accountLast4: null, ifsc: null },
  confidence: 0.95,
};
const answer = (model: string) =>
  new Response(JSON.stringify({ model, choices: [{ message: { content: JSON.stringify(reading) } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0001 } }));

// Answers by model: each handler decides what that model's request gets.
function byModel(handlers: Record<string, (init: RequestInit) => Promise<Response>>) {
  const calls: string[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const model = JSON.parse(String(init.body)).model as string;
    calls.push(model);
    return handlers[model](init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const neverAnswers = (init: RequestInit) =>
  new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

const client = (impl: typeof fetch) => createOpenRouter({ apiKey: KEY, budgetUsd: 1, fetchImpl: impl, maxRetries: 0, sleep: async () => {} });

describe("the OpenRouter client, for slow models", () => {
  it("retries when the answer times out on its way in (F-024)", async () => {
    let n = 0;
    const impl = (async () => {
      n++;
      if (n === 1) return { ok: true, status: 200, text: () => Promise.reject(new DOMException("timed out", "TimeoutError")) } as unknown as Response;
      return answer(GEMMA);
    }) as unknown as typeof fetch;
    const c = createOpenRouter({ apiKey: KEY, budgetUsd: 1, fetchImpl: impl, sleep: async () => {} });
    const r = await c.chatJson({ model: GEMMA, system: "s", user: [], schema: {}, schemaName: "x" });
    expect(r.model).toBe(GEMMA);
    expect(n).toBe(2);
  });

  it("gives up at once, without retrying, when the caller cancels", async () => {
    const f = byModel({ [GEMMA]: neverAnswers });
    const c = createOpenRouter({ apiKey: KEY, budgetUsd: 1, fetchImpl: f.impl, sleep: async () => {} });
    const stop = new AbortController();
    const pending = c.chatJson({ model: GEMMA, system: "s", user: [], schema: {}, schemaName: "x", signal: stop.signal });
    stop.abort();
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(f.calls).toHaveLength(1);
  });

  it("stops waiting out a backoff the moment the caller cancels", async () => {
    const f = byModel({ [GEMMA]: async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429, headers: { "retry-after": "10" } }) });
    // A backoff that would never end by itself.
    const c = createOpenRouter({ apiKey: KEY, budgetUsd: 1, fetchImpl: f.impl, sleep: () => new Promise(() => {}) });
    const stop = new AbortController();
    const pending = c.chatJson({ model: GEMMA, system: "s", user: [], schema: {}, schemaName: "x", signal: stop.signal });
    await new Promise((r) => setTimeout(r, 10));
    stop.abort();
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(f.calls).toHaveLength(1);
  });

  it("counts a call cut off mid-answer, which the provider may still bill", async () => {
    const f = byModel({ [GEMMA]: neverAnswers });
    const c = createOpenRouter({ apiKey: KEY, budgetUsd: 1, fetchImpl: f.impl, sleep: async () => {} });
    const stop = new AbortController();
    const pending = c.chatJson({ model: GEMMA, system: "s", user: [], schema: {}, schemaName: "x", signal: stop.signal });
    stop.abort();
    await pending.catch(() => undefined);
    expect(c.spent()).toEqual({ usd: 0, calls: 0, abandoned: 1 });
  });
});

describe("the app's reader: Gemma, then Sonnet", () => {
  const chain = (impl: typeof fetch, timeoutMs = 50, fallbackTimeoutMs = 1000) =>
    createFallbackReader(client(impl), { primary: GEMMA, fallback: SONNET, timeoutMs, fallbackTimeoutMs });

  it("uses Gemma's answer when Gemma answers in time", async () => {
    const f = byModel({ [GEMMA]: async () => answer(GEMMA), [SONNET]: async () => answer(SONNET) });
    const r = await chain(f.impl).readImage(Buffer.from("x"));
    expect(r).toMatchObject({ answeredBy: GEMMA, fallback: null });
    expect(f.calls).toEqual([GEMMA]);
  });

  it("asks Sonnet when Gemma is too slow, and cancels Gemma", async () => {
    const f = byModel({ [GEMMA]: neverAnswers, [SONNET]: async () => answer(SONNET) });
    const r = await chain(f.impl).readImage(Buffer.from("x"));
    expect(r.answeredBy).toBe(SONNET);
    expect(r.fallback).toMatch(/slower than/);
  });

  it("asks Sonnet when Gemma fails or answers off the schema", async () => {
    for (const gemma of [
      async () => new Response(JSON.stringify({ error: { message: "upstream error" } }), { status: 500 }),
      async () => new Response(JSON.stringify({ model: GEMMA, choices: [{ message: { content: JSON.stringify({ docType: "PASSPORT" }) } }] })),
    ]) {
      const f = byModel({ [GEMMA]: gemma, [SONNET]: async () => answer(SONNET) });
      const r = await chain(f.impl).readImage(Buffer.from("x"));
      expect(r.answeredBy).toBe(SONNET);
      expect(r.fallback).toMatch(/primary failed/);
    }
  });

  it("counts the wait for a slow Gemma in the time the photo took", async () => {
    const f = byModel({ [GEMMA]: neverAnswers, [SONNET]: async () => answer(SONNET) });
    const r = await chain(f.impl, 50).readImage(Buffer.from("x"));
    expect(r.ms).toBeGreaterThanOrEqual(45);
  });

  it("gives Sonnet a deadline of its own", async () => {
    const f = byModel({ [GEMMA]: async () => new Response(JSON.stringify({ error: { message: "upstream error" } }), { status: 500 }), [SONNET]: neverAnswers });
    await expect(chain(f.impl, 50, 30).readImage(Buffer.from("x"))).rejects.toThrow(/no answer within 0.03 s/);
    expect(f.calls).toEqual([GEMMA, SONNET]);
  });

  it("doesn't try Sonnet when the account itself is the problem", async () => {
    const f = byModel({ [GEMMA]: async () => new Response(JSON.stringify({ error: { message: "no credit" } }), { status: 402 }), [SONNET]: async () => answer(SONNET) });
    await expect(chain(f.impl).readImage(Buffer.from("x"))).rejects.toThrow(OpenRouterError);
    expect(f.calls).toEqual([GEMMA]);
  });
});

describe("the photo step", () => {
  it("reads a demo photo once, then keeps the answer for the same bytes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kycready-photos-"));
    writeFileSync(path.join(dir, "S1.jpg"), "same bytes");
    let reads = 0;
    const reader = aiPhotoReader(
      {
        readImage: async () => {
          reads++;
          return { reading: readSpecimen({ kind: "DL", printed: {} }), usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, ms: 1, answeredBy: SONNET, fallback: "primary slower than 10 s" };
        },
      },
      dir,
    );
    const doc = { kind: "DL" as const, printed: {} };
    const first = await reader.read({ shotId: "S1", doc });
    const second = await reader.read({ shotId: "S1", doc });
    expect(reads).toBe(1);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ readBy: SONNET, fallbackReason: "primary slower than 10 s" });
  });

  async function atLicenceStep(reader: PhotoReader): Promise<KycContext> {
    const ctx: KycContext = { store: new Store(), clock: new ManualClock(istAt(2026, 8, 29, 10)), world: createWorld() };
    await seedDemo(ctx); // the seeded cast is read by the stand-in
    consent(ctx, "c01");
    ctx.reader = reader;
    return ctx;
  }

  it("records which model read the photo", async () => {
    const ctx = await atLicenceStep({ name: "fake", read: async ({ doc }) => ({ reading: readSpecimen(doc), readBy: GEMMA, fallbackReason: null }) });
    expect(await takePhoto(ctx, "c01", "DL", "clean")).toEqual({ issue: null });
    expect(ctx.store.currentDocuments("c01").DL).toMatchObject({ readBy: GEMMA, fallbackReason: null, issue: null });
  });

  it("stores nothing, and never passes the photo, when no model could read it", async () => {
    const ctx = await atLicenceStep({
      name: "down",
      read: async () => {
        throw new Error("both models failed");
      },
    });
    const logged: string[] = [];
    ctx.log = (m) => logged.push(m);
    const err = await takePhoto(ctx, "c01", "DL", "clean").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KycError);
    expect((err as KycError).httpStatus).toBe(503);
    expect(ctx.store.currentDocuments("c01").DL).toBeUndefined();
    expect(logged).toEqual([expect.stringMatching(/wasn't read: both models failed$/)]);
  });
});
