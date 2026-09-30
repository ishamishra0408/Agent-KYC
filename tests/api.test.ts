import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/api/app";
import { Store } from "../server/db/store";
import { seedDemo } from "../server/demo/seed";
import { createWorld } from "../server/demo/world";
import { ManualClock } from "../server/domain/clock";
import { istAt } from "../server/domain/time";
import type { KycContext } from "../server/services/kyc";

const root = fileURLToPath(new URL("..", import.meta.url));
let server: Server;
let base = "";

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, raw: text };
}

beforeAll(async () => {
  const ctx: KycContext = { store: new Store(), clock: new ManualClock(istAt(2026, 8, 29, 10)), world: createWorld() };
  const reset = async () => {
    ctx.store = new Store();
    ctx.clock = new ManualClock(istAt(2026, 8, 29, 10));
    ctx.world = createWorld();
    await seedDemo(ctx);
  };
  await reset();
  const app = createApp({ ctx, specimenDir: path.join(root, "evals/specimens"), resultsDir: path.join(root, "evals/results"), reset });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

describe("demo API", () => {
  it("seeds every persona through the real rules", async () => {
    const { body } = await call("GET", "/api/state");
    const status = Object.fromEntries(body.drivers.map((d: { id: string; status: string }) => [d.id, d.status]));
    expect(status).toEqual({
      c01: "SIGNED_UP",
      c06: "APPROVED",
      c07: "APPROVED",
      c08: "APPROVED",
      c10: "DOCS_IN_PROGRESS",
      c11: "DOCS_IN_PROGRESS",
      c14: "IN_REVIEW",
      c21: "NEEDS_FIX",
      c22: "NEEDS_FIX",
      c27: "IN_REVIEW",
    });
  });

  it("takes Ramesh from signup to a first booked load", async () => {
    expect((await call("POST", "/api/drivers/c01/consent")).status).toBe(200);

    const blurry = await call("POST", "/api/drivers/c01/photo", { slot: "DL", variant: "blurry" });
    expect(blurry.body.issue).toBe("PHOTO_BLURRY"); // coached the moment the photo is taken
    expect((await call("GET", "/api/drivers/c01")).body.nextStep).toBe("DL");

    await call("POST", "/api/drivers/c01/photo", { slot: "DL", variant: "clean" });
    await call("POST", "/api/drivers/c01/photo", { slot: "PAN", variant: "clean" });
    await call("POST", "/api/drivers/c01/bank-check");
    await call("POST", "/api/drivers/c01/selfie");
    expect((await call("GET", "/api/drivers/c01")).body.nextStep).toBe("SUBMIT");

    expect((await call("GET", "/api/drivers/c01/loads")).status).toBe(403); // locked before approval

    expect((await call("POST", "/api/drivers/c01/submit")).body.outcome).toBe("APPROVE");
    const loads = await call("GET", "/api/drivers/c01/loads");
    expect(loads.status).toBe(200);
    expect(loads.body.loads.length).toBeGreaterThan(0);

    const booked = await call("POST", "/api/drivers/c01/loads/L1/book");
    expect(booked.body).toEqual({ ok: true, firstTrip: true });
    expect((await call("GET", "/api/drivers/c01")).body.driver.status).toBe("ACTIVE");
  });

  it("never tells a driver why they were sent to review", async () => {
    const reviewCodes = [
      "SUSPICIOUS_TEXT",
      "SHARED_BANK_ACCOUNT",
      "FACE_MISMATCH",
      "DOB_MISMATCH",
      "NAME_MISMATCH_IDS",
      "PRINTED_REGISTRY_MISMATCH",
      "DL_NOT_FOUND",
      "PAN_NOT_FOUND",
      "LOW_CONFIDENCE",
      "REPEATED_FIX",
    ];
    const { body } = await call("GET", "/api/state");
    const inReview = body.drivers.filter((d: { status: string }) => d.status === "IN_REVIEW");
    expect(inReview.length).toBeGreaterThan(0);
    for (const d of inReview) {
      const view = await call("GET", `/api/drivers/${d.id}`);
      expect(view.body.decision.fixes).toEqual([]);
      for (const code of reviewCodes) expect(view.raw).not.toContain(code);
      expect(view.raw).not.toMatch(/suspiciousText|evidence|pre-approved|verification system|Sharers/);
    }
  });

  it("lets a driver submit again after fixing something outside the app, then hands a third try to a person", async () => {
    expect((await call("GET", "/api/drivers/c21")).body.nextStep).toBe("SUBMIT");
    expect((await call("POST", "/api/drivers/c21/submit")).body.outcome).toBe("NEEDS_FIX"); // same fix, asked twice now
    expect((await call("POST", "/api/drivers/c21/submit")).body.outcome).toBe("REVIEW"); // a third ask goes to a person
  });

  it("approves a hired driver once the fleet owner confirms them", async () => {
    expect((await call("POST", "/api/ops/drivers/c22/confirm-owner")).body.ownerLinkVerified).toBe(true);
    expect((await call("POST", "/api/drivers/c22/submit")).body.outcome).toBe("APPROVE");
  });

  it("shows reviewers the evidence, including the ring on Meena's account", async () => {
    const queue = await call("GET", "/api/ops/review");
    expect(queue.body.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining(["c14", "c27"]));

    const c = await call("GET", "/api/ops/drivers/c14/case");
    expect(c.body.decision.reasons.map((r: { code: string }) => r.code)).toContain("SHARED_BANK_ACCOUNT");
    expect(c.body.graph.sharedBankAccount.sharers.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(["Vikram S", "Arun P"]),
    );
    expect(c.body.summary).toBe("Bank account shared with drivers who have no link to its holder (MEENA KUMARI): Vikram S, Arun P.");
    expect(c.body.registrySimulated).toBe(true);
  });

  it("requires a reason for a reviewer's decision", async () => {
    expect((await call("POST", "/api/ops/drivers/c14/decision", { choice: "APPROVE", note: " " })).status).toBe(400);
    const ok = await call("POST", "/api/ops/drivers/c14/decision", { choice: "REJECT", note: "Account shared with unrelated drivers" });
    expect(ok.body.status).toBe("REJECTED");
  });

  it("sends a driver back to the step a reviewer picked", async () => {
    const note = "Retake the licence without the sticker";
    expect((await call("POST", "/api/ops/drivers/c27/decision", { choice: "NEEDS_FIX", note })).status).toBe(400);
    const ok = await call("POST", "/api/ops/drivers/c27/decision", { choice: "NEEDS_FIX", note, step: "DL" });
    expect(ok.body.status).toBe("NEEDS_FIX");
    const view = await call("GET", "/api/drivers/c27");
    expect(view.body.nextStep).toBe("DL");
    expect(view.body.decision.fixes.map((f: { code: string }) => f.code)).toEqual(["REVIEWER_FIX"]);
  });

  it("moves the clock and runs the nudge cycle", async () => {
    const r = await call("POST", "/api/demo/advance", { hours: 48 });
    expect(r.status).toBe(200);
    const sentTo = r.body.cycle.filter((i: { action: string }) => i.action === "send").map((i: { driverId: string }) => i.driverId);
    expect(sentTo).toContain("c11"); // blurry photo, stuck: nudged again after 2 days
    const log = await call("GET", "/api/ops/nudges");
    expect(log.body.some((n: { driverId: string; deepLink: string }) => n.driverId === "c11" && n.deepLink === "/kyc/documents")).toBe(true);
  });

  it("reminds an approved driver once to renew a licence that runs out within 30 days", async () => {
    const view = await call("GET", "/api/drivers/c06");
    expect(view.body.driver.status).toBe("APPROVED");
    expect(view.body.inbox.map((n: { text: string }) => n.text).join(" ")).toMatch(/runs out on 18 October 2026/);
    const log = await call("GET", "/api/ops/nudges");
    const reminders = log.body.filter((n: { driverId: string; action: string; deepLink: string }) => n.driverId === "c06" && n.action === "send");
    expect(reminders.map((n: { deepLink: string }) => n.deepLink)).toEqual(["/kyc/licence"]); // once, even after the clock moved 2 days
    const c = await call("GET", "/api/ops/drivers/c06/case");
    expect(c.body.notices.map((n: { code: string }) => n.code)).toEqual(["LICENCE_EXPIRES_SOON"]);
  });

  it("rejects bad input and unknown drivers", async () => {
    expect((await call("POST", "/api/drivers/c10/photo", { slot: "LICENCE", variant: "clean" })).status).toBe(400);
    expect((await call("GET", "/api/drivers/nobody")).status).toBe(404);
    expect((await call("POST", "/api/drivers/c07/consent")).status).toBe(409);
    const malformed = await fetch(`${base}/api/drivers/c10/photo`, { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
    expect(malformed.status).toBe(400);
  });

  it.skipIf(!existsSync(path.join(root, "evals/specimens/demo")))("serves the demo camera photos", async () => {
    const shots = await call("GET", "/api/drivers/c10/shots/DL");
    expect(shots.body.map((s: { variant: string }) => s.variant)).toEqual(["clean", "blurry", "glare", "screen"]);
    const img = await fetch(base + shots.body[0].url);
    expect(img.status).toBe(200);
  });

  it("locks Priya's bookings when her licence lapses, then reopens them once the renewed one passes (question 9)", async () => {
    for (let week = 0; week < 3; week++) expect((await call("POST", "/api/demo/advance", { hours: 168 })).status).toBe(200); // past 18 Oct, her last valid day
    expect((await call("GET", "/api/drivers/c06")).body.driver.status).toBe("LICENCE_EXPIRED");
    const locked = await call("POST", "/api/drivers/c06/loads/L1/book");
    expect(locked.status).toBe(403);
    expect(locked.body.error).toMatch(/renewed licence/);

    await call("POST", "/api/drivers/c06/digilocker", { slot: "DL" }); // SIMULATED: renewed at the RTO
    expect((await call("GET", "/api/drivers/c06")).body.nextStep).toBe("SUBMIT");
    expect((await call("POST", "/api/drivers/c06/submit")).body.outcome).toBe("APPROVE");
    expect((await call("POST", "/api/drivers/c06/loads/L1/book")).status).toBe(200);
  });
});

