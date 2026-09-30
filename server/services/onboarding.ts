import type { DriverRow, Store } from "../db/store";
import { canBook } from "../domain/bookings";
import { REASONS } from "../domain/reasons";
import { isIssuedByRules } from "../domain/rules";
import type { Decision, DocType, Reason, Status } from "../domain/types";

const RULES_OUTCOME_TO_STATUS: Record<Decision["outcome"], Status> = {
  APPROVE: "APPROVED",
  NEEDS_FIX: "NEEDS_FIX",
  REVIEW: "IN_REVIEW",
};

export class ForgedDecisionError extends Error {}

// The one automatic door to APPROVED. Two locks: the decision must have come out of decide(),
// and the status machine must allow the "rules" actor to make this move.
export function applyRulesDecision(store: Store, driverId: string, decision: Decision, now: Date): DriverRow {
  if (!isIssuedByRules(decision)) {
    throw new ForgedDecisionError("Only decisions made by the rules engine can be applied.");
  }
  return store.transaction(() => {
    const d = store.move(driverId, RULES_OUTCOME_TO_STATUS[decision.outcome], "rules", now, {
      reasons: decision.reasons.map((r) => r.code),
      rulesVersion: decision.rulesVersion,
    });
    store.recordDecision(driverId, "rules", decision.outcome, decision.reasons, decision.passed, decision.rulesVersion, now, null, decision.notices);
    return d;
  });
}

export type HumanChoice = "APPROVE" | "NEEDS_FIX" | "REJECT";

const HUMAN_CHOICE_TO_STATUS: Record<HumanChoice, Status> = {
  APPROVE: "APPROVED",
  NEEDS_FIX: "NEEDS_FIX",
  REJECT: "REJECTED",
};

export class MissingReasonError extends Error {}

// A decision the process won't take, whoever asks: e.g. approving a licence the registry says has expired.
export class DecisionRefusedError extends Error {}

// The step a reviewer can send a driver back to.
export type FixStep = "DL" | "PAN" | "BANK" | "SELFIE";
const STEP_DOC: Record<FixStep, DocType | undefined> = { DL: "DL", PAN: "PAN", BANK: "BANK_PROOF", SELFIE: undefined };

function reviewerFix(step: FixStep): Reason {
  const info = REASONS.REVIEWER_FIX;
  const r: Reason = { code: "REVIEWER_FIX", severity: info.severity, driverMessage: info.driver.en, opsMessage: info.ops, evidence: { step } };
  const doc = STEP_DOC[step];
  if (doc) r.doc = doc;
  return r;
}

// A reviewer's decision on a case the rules sent to review. A reason is required:
// every human decision becomes evidence, and later a test case. A fix request also names the step
// to redo, so the driver lands on it (question 8, D-031).
// There's no reviewer login: this is a local demo, and the API only listens on 127.0.0.1.
export function humanDecision(
  store: Store,
  driverId: string,
  choice: HumanChoice,
  note: string,
  now: Date,
  opts: { reviewer?: string; step?: FixStep } = {},
): DriverRow {
  if (!note.trim()) throw new MissingReasonError("A reason is required for every decision.");
  if (choice === "NEEDS_FIX" && !opts.step) throw new MissingReasonError("Pick the step the driver should redo.");
  const checked = store.decisions(driverId).filter((x) => x.actor === "rules").at(-1);
  if (choice === "APPROVE" && checked?.reasons.some((r) => r.code === "DL_EXPIRED")) {
    throw new DecisionRefusedError("The licence has expired, so it can't be approved. Ask for the renewed licence instead.");
  }
  const reasons = choice === "NEEDS_FIX" && opts.step ? [reviewerFix(opts.step)] : [];
  return store.transaction(() => {
    const d = store.move(driverId, HUMAN_CHOICE_TO_STATUS[choice], "human", now, { note, reviewer: opts.reviewer ?? "ops", step: opts.step });
    store.recordDecision(driverId, "human", choice, reasons, [], null, now, note);
    return d;
  });
}

export type BookingResult = { ok: true } | { ok: false; httpStatus: 403 | 404; message: string };

// The bookings lock. The API layer (Phase 4) turns a refusal into an HTTP 403.
export function tryBook(store: Store, driverId: string): BookingResult {
  const d = store.getDriver(driverId);
  if (!d) return { ok: false, httpStatus: 404, message: "Driver not found." };
  if (d.status === "LICENCE_EXPIRED") return { ok: false, httpStatus: 403, message: "Your licence has expired. Upload your renewed licence to book loads." };
  if (!canBook(d.status)) return { ok: false, httpStatus: 403, message: "Finish verification to book loads." };
  return { ok: true };
}
