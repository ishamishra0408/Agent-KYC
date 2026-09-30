import { describe, expect, it } from "vitest";
import { CASES, EVAL_NOW } from "../evals/cases";
import { buildWorld } from "../evals/harness";
import { oracleReader } from "../evals/readers";
import { Store } from "../server/db/store";
import { fixedClock } from "../server/domain/clock";
import type { DocType, Submission } from "../server/domain/types";
import { applyRulesDecision, tryBook } from "../server/services/onboarding";
import { verifySubmission } from "../server/verify";

// Whole path, no shortcuts: photo reading -> registries and graph -> rules -> status -> bookings lock.
async function submit(caseId: string) {
  const c = CASES.find((x) => x.id === caseId);
  if (!c) throw new Error(caseId);
  const store = new Store();
  store.addDriver(c.driver, EVAL_NOW);
  for (const s of ["CONSENTED", "DOCS_IN_PROGRESS", "SUBMITTED"] as const) store.move(c.driver.id, s, "driver", EVAL_NOW);

  const readings: Submission["readings"] = {};
  for (const slot of Object.keys(c.images) as DocType[]) {
    const doc = c.images[slot];
    if (doc) readings[slot] = await oracleReader.read({ caseId, slot, imagePath: "", doc });
  }
  const deps = { ...buildWorld(), clock: fixedClock(EVAL_NOW), priorFixReasons: (id: string) => store.priorFixReasons(id) };
  const decision = await verifySubmission({ driver: c.driver, readings }, deps);
  applyRulesDecision(store, c.driver.id, decision, EVAL_NOW);
  return { store, id: c.driver.id, decision };
}

describe("end to end", () => {
  it("a clean driver is approved and can book", async () => {
    const { store, id } = await submit("C01");
    expect(store.mustGet(id).status).toBe("APPROVED");
    expect(tryBook(store, id)).toEqual({ ok: true });
  });

  it("a driver with a hidden 'approve me' note goes to a person and can't book", async () => {
    const { store, id, decision } = await submit("C27");
    expect(decision.outcome).toBe("REVIEW");
    expect(store.mustGet(id).status).toBe("IN_REVIEW");
    expect(tryBook(store, id)).toMatchObject({ ok: false, httpStatus: 403 });
  });
});
