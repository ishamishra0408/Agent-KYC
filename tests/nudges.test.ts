import { describe, expect, it } from "vitest";
import { Store } from "../server/db/store";
import { ManualClock } from "../server/domain/clock";
import { deepLinkFor, gateway, type GatewayInput } from "../server/domain/nudgeRules";
import { REASONS } from "../server/domain/reasons";
import { istAt } from "../server/domain/time";
import type { Status } from "../server/domain/types";
import { mockNudgeWriter } from "../server/ai/mockNudgeWriter";
import { runNudgeCycle } from "../server/services/nudges";
import { applyRulesDecision, humanDecision, tryBook } from "../server/services/onboarding";
import { decide } from "../server/policy";
import { cleanEvidence, decisions } from "./helpers";

// Sept is month 8 (0-based). Day 0 = Mon 28 Sep 2026, IST.
const at = (day: number, hour: number, minute = 0) => istAt(2026, 8, 28 + day, hour, minute);

type Extras = Omit<GatewayInput, "status" | "now">;
const base: Extras = { optedOut: false, lastNudgeAt: null, statusUpdateSentForCurrentStatus: false };
const g = (status: Status, now: Date, over: Partial<Extras> = {}) => gateway({ ...base, ...over, status, now });

describe("send gateway", () => {
  it("lets a renewal reminder through for an approved driver, never for a rejected one", () => {
    expect(g("ACTIVE", at(0, 10), { renewalDue: true }).action).toBe("send");
    expect(g("REJECTED", at(0, 10), { renewalDue: true }).action).toBe("skip");
    expect(g("APPROVED", at(0, 10)).action).toBe("skip");
  });

  it("sends at most one nudge per 2 days", () => {
    const first = at(0, 10);
    expect(g("DOCS_IN_PROGRESS", first).action).toBe("send");

    const nextDay = g("DOCS_IN_PROGRESS", at(1, 10), { lastNudgeAt: first });
    expect(nextDay.action).toBe("hold");
    expect(nextDay.notBefore).toEqual(at(2, 10));

    expect(g("DOCS_IN_PROGRESS", at(2, 10), { lastNudgeAt: first }).action).toBe("send");
  });

  it("holds night sends until 8 AM", () => {
    const late = g("DOCS_IN_PROGRESS", at(0, 22));
    expect(late.action).toBe("hold");
    expect(late.notBefore).toEqual(at(1, 8));

    const early = g("DOCS_IN_PROGRESS", at(0, 7));
    expect(early.notBefore).toEqual(at(0, 8));
  });

  it("moves a 2-day wait that ends at night to the next morning", () => {
    // Only possible if something was sent at night (say, by hand), but the wait must still end in daylight.
    const r = g("DOCS_IN_PROGRESS", at(1, 12), { lastNudgeAt: at(0, 22, 30) });
    expect(r.action).toBe("hold");
    expect(r.notBefore).toEqual(at(3, 8));
  });

  it("stops once approved, rejected, or opted out", () => {
    expect(g("APPROVED", at(0, 10)).action).toBe("skip");
    expect(g("REJECTED", at(0, 10)).action).toBe("skip");
    expect(g("DOCS_IN_PROGRESS", at(0, 10), { optedOut: true }).action).toBe("skip");
  });

  it("gives drivers waiting on us one status update, never a reminder", () => {
    expect(g("IN_REVIEW", at(0, 10)).action).toBe("status_update");
    expect(g("IN_REVIEW", at(1, 10), { statusUpdateSentForCurrentStatus: true }).action).toBe("skip");
    expect(g("IN_REVIEW", at(0, 23)).action).toBe("hold");
  });
});

describe("deep links: a tap lands on the stuck step", () => {
  it.each([
    ["NOT_STARTED", undefined, "/kyc/consent"],
    ["DOCS_PENDING", undefined, "/kyc/documents"],
    ["NEEDS_FIX", "DL", "/kyc/fix/dl"],
    ["NEEDS_FIX", "SELFIE", "/kyc/fix/selfie"],
    ["WAITING_ON_US", undefined, "/kyc/status"],
  ] as const)("%s %s -> %s", (blocker, target, link) => {
    expect(deepLinkFor(blocker, target)).toBe(link);
  });
});

describe("nudge cycle over a week (mocked clock)", () => {
  it("follows one driver from signup to approval", async () => {
    const store = new Store();
    const clock = new ManualClock(at(0, 9));
    store.addDriver({ id: "d1", name: "Ramesh Kumar", phone: "+91 00000 00001", partnerType: "owner_driver" }, clock.now());

    // Day 0, 10 AM: first nudge, linking to consent.
    clock.set(at(0, 10));
    let [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("send");
    expect(r.text).toContain("Ramesh");
    expect(r.deepLink).toBe("/kyc/consent");

    // Day 0, 10 PM: nothing goes out at night.
    clock.set(at(0, 22));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("hold");

    // Day 1: held, and logged once even if the cycle runs twice.
    clock.set(at(1, 10));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("hold");
    await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(store.nudges("d1").filter((n) => n.action === "hold" && n.reason === "max 1 nudge per 2 days")).toHaveLength(1);

    // Day 2: allowed again.
    clock.set(at(2, 10));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("send");

    // Driver submits: now waiting on us. One status update, then silence.
    store.move("d1", "CONSENTED", "driver", clock.now());
    store.move("d1", "DOCS_IN_PROGRESS", "driver", clock.now());
    store.move("d1", "SUBMITTED", "driver", clock.now());
    clock.set(at(3, 10));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("status_update");
    clock.set(at(4, 10));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("skip");

    // Rules find a blurry licence: the next nudge names the fix and links straight to it.
    applyRulesDecision(store, "d1", decisions.blurryLicence(), clock.now());
    clock.set(at(5, 10));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("send");
    expect(r.text).toContain(REASONS.PHOTO_BLURRY.driver.en);
    expect(r.deepLink).toBe("/kyc/fix/dl");

    // Approved after a retake: no more nudges.
    store.move("d1", "SUBMITTED", "driver", clock.now());
    applyRulesDecision(store, "d1", decisions.approve(), clock.now());
    clock.set(at(7, 10));
    [r] = await runNudgeCycle(store, mockNudgeWriter, clock.now());
    expect(r.action).toBe("skip");
  });

  it("writes in Hindi for Hindi speakers and respects opt-out", async () => {
    const store = new Store();
    store.addDriver({ id: "d2", name: "Lakshmi Devi", phone: "+91 00000 00002", partnerType: "owner_driver" }, at(0, 9), "hi");
    let [r] = await runNudgeCycle(store, mockNudgeWriter, at(0, 10));
    expect(r.text).toContain("जी");

    store.setOptedOut("d2", true, at(0, 11));
    [r] = await runNudgeCycle(store, mockNudgeWriter, at(3, 10));
    expect(r.action).toBe("skip");
  });

  it("gives a fresh status update after a second trip into review", async () => {
    const store = new Store();
    store.addDriver({ id: "d3", name: "Pooja Nair", phone: "+91 00000 00003", partnerType: "owner_driver" }, at(0, 9));
    for (const s of ["CONSENTED", "DOCS_IN_PROGRESS", "SUBMITTED"] as const) store.move("d3", s, "driver", at(0, 9));
    applyRulesDecision(store, "d3", decisions.review(), at(0, 9));
    expect((await runNudgeCycle(store, mockNudgeWriter, at(0, 10)))[0].action).toBe("status_update");

    humanDecision(store, "d3", "NEEDS_FIX", "Upload a clearer PAN", at(1, 9), { step: "PAN" });
    store.move("d3", "SUBMITTED", "driver", at(1, 12));
    applyRulesDecision(store, "d3", decisions.review(), at(1, 12));
    expect((await runNudgeCycle(store, mockNudgeWriter, at(1, 13)))[0].action).toBe("status_update");
  });

  it("reminds an approved driver once per licence when it's about to run out (question 3)", async () => {
    const store = new Store();
    store.addDriver({ id: "d4", name: "Priya Sharma", phone: "+91 00000 00004", partnerType: "owner_driver" }, at(0, 9));
    for (const s of ["CONSENTED", "DOCS_IN_PROGRESS", "SUBMITTED"] as const) store.move("d4", s, "driver", at(0, 9));
    const expiring = (validTill: string) =>
      decide(cleanEvidence({ dlRecord: { number: "KA0120150004821", name: "RAMESH KUMAR", dob: "1988-03-14", validTill } }));
    applyRulesDecision(store, "d4", expiring("2026-10-18"), at(0, 9)); // 20 days left

    let [r] = await runNudgeCycle(store, mockNudgeWriter, at(0, 10));
    expect([r.action, r.deepLink]).toEqual(["send", "/kyc/licence"]);
    expect(r.text).toContain("18 October 2026");
    [r] = await runNudgeCycle(store, mockNudgeWriter, at(3, 10));
    expect(r.action).toBe("skip"); // once per licence, not every 2 days

    // A renewed licence that's checked again starts a new window of its own.
    store.move("d4", "ACTIVE", "system", at(4, 9));
    store.recordDecision("d4", "rules", "APPROVE", [], expiring("2026-11-01").passed, "v3", at(4, 9));
    [r] = await runNudgeCycle(store, mockNudgeWriter, at(4, 10));
    expect(r.action).toBe("send");
  });

  it("locks bookings the day after the licence's last valid day, and asks for the renewed one (question 9)", async () => {
    const store = new Store();
    store.addDriver({ id: "d5", name: "Priya Sharma", phone: "+91 00000 00005", partnerType: "owner_driver" }, at(0, 9));
    for (const s of ["CONSENTED", "DOCS_IN_PROGRESS", "SUBMITTED"] as const) store.move("d5", s, "driver", at(0, 9));
    applyRulesDecision(store, "d5", decide(cleanEvidence({ dlRecord: { number: "KA0120150004821", name: "RAMESH KUMAR", dob: "1988-03-14", validTill: "2026-09-30" } })), at(0, 9));

    await runNudgeCycle(store, mockNudgeWriter, at(2, 10)); // 30 Sep: the last valid day
    expect(store.mustGet("d5").status).toBe("APPROVED");
    let [r] = await runNudgeCycle(store, mockNudgeWriter, at(3, 10)); // 1 Oct: lapsed
    expect(store.mustGet("d5").status).toBe("LICENCE_EXPIRED");
    expect(tryBook(store, "d5")).toMatchObject({ ok: false, httpStatus: 403, message: expect.stringMatching(/renewed licence/) });
    expect(r.action).toBe("hold"); // yesterday's renewal reminder counts toward the 2-day limit
    [r] = await runNudgeCycle(store, mockNudgeWriter, at(4, 10));
    expect([r.action, r.deepLink]).toEqual(["send", "/kyc/licence"]);
    expect(r.text).toContain("ran out on 30 September 2026");
  });
});

