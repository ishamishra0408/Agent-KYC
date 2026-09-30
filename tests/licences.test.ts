import { describe, expect, it } from "vitest";
import { Store } from "../server/db/store";
import { seedDemo } from "../server/demo/seed";
import { createWorld } from "../server/demo/world";
import { ManualClock } from "../server/domain/clock";
import { istAt } from "../server/domain/time";
import { book, nextStep, submit, useDigilocker, type KycContext } from "../server/services/kyc";

// Question 9 (D-032), step by step, on the demo's Priya: approved with a licence whose last valid
// day is 18 Oct 2026.
async function demo(): Promise<{ ctx: KycContext; clock: ManualClock }> {
  const clock = new ManualClock(istAt(2026, 8, 29, 10));
  const ctx: KycContext = { store: new Store(), clock, world: createWorld() };
  await seedDemo(ctx);
  return { ctx, clock };
}

const dayAfterLastValidDay = istAt(2026, 9, 19, 10); // 19 Oct (months are 0-based)

describe("a licence that lapses after approval (question 9)", () => {
  it("locks an active driver at their next booking, even before any sweep has run", async () => {
    const { ctx, clock } = await demo();
    expect(book(ctx, "c06", "L1")).toMatchObject({ ok: true, firstTrip: true });
    expect(ctx.store.mustGet("c06").status).toBe("ACTIVE");

    clock.set(dayAfterLastValidDay); // no nudge cycle has run since
    expect(book(ctx, "c06", "L2")).toMatchObject({ ok: false, httpStatus: 403 });
    expect(ctx.store.mustGet("c06").status).toBe("LICENCE_EXPIRED");
  });

  it("takes a renewed licence fetched the moment it lapsed; the next load isn't a first trip", async () => {
    const { ctx, clock } = await demo();
    book(ctx, "c06", "L1");
    clock.set(dayAfterLastValidDay);
    book(ctx, "c06", "L2"); // lapses now
    expect(nextStep(ctx.store, ctx.store.mustGet("c06"))).toBe("DL");

    useDigilocker(ctx, "c06", "DL"); // same instant as the lapse; SIMULATED: renewed at the RTO
    expect(nextStep(ctx.store, ctx.store.mustGet("c06"))).toBe("SUBMIT");
    expect((await submit(ctx, "c06")).outcome).toBe("APPROVE");
    expect(book(ctx, "c06", "L2")).toEqual({ ok: true });
  });
});
