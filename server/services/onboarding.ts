import type { DriverRow, Store } from "../db/store";
import type { VehicleRecord } from "../domain/types";
import { isIssuedVehicleDecision, type VehicleDecision } from "../domain/vehicle";
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

// The only door for a vehicle decision (D-049): one the vehicle policy minted, or nothing.
export function applyVehicleDecision(store: Store, driverId: string, number: string, record: VehicleRecord | null, decision: VehicleDecision, now: Date): void {
  if (!isIssuedVehicleDecision(decision)) throw new ForgedDecisionError("Only decisions made by the vehicle policy can be applied.");
  store.recordVehicleDecision(driverId, now, number, record, decision);
}

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
  opts: { reviewer?: string; step?: FixStep; draft?: string } = {},
): DriverRow {
  if (!note.trim()) throw new MissingReasonError("A reason is required for every decision.");
  if (choice === "NEEDS_FIX" && !opts.step) throw new MissingReasonError("Pick the step the driver should redo.");
  const checked = store.decisions(driverId).filter((x) => x.actor === "rules").at(-1);
  if (choice === "APPROVE" && checked?.reasons.some((r) => r.code === "DL_EXPIRED")) {
    throw new DecisionRefusedError("The licence has expired, so it can't be approved. Ask for the renewed licence instead.");
  }
  const reasons = choice === "NEEDS_FIX" && opts.step ? [reviewerFix(opts.step)] : [];
  // What the person was shown, frozen with their decision, so a human approval is as auditable as a
  // rules one: the rules' decision, the documents as read, and whether the note began as a draft.
  const documents = Object.fromEntries(
    Object.entries(store.currentDocuments(driverId)).map(([slot, doc]) => [
      slot,
      { source: doc.source, fields: doc.reading?.fields ?? null, issue: doc.issue, readBy: doc.readBy ?? null },
    ]),
  );
  const evidence = {
    basedOn: checked
      ? { at: checked.at, rulesVersion: checked.rulesVersion, outcome: checked.outcome, reasons: checked.reasons, passed: checked.passed }
      : null,
    documents,
    draft: opts.draft ?? null,
  };
  return store.transaction(() => {
    const d = store.move(driverId, HUMAN_CHOICE_TO_STATUS[choice], "human", now, { note, reviewer: opts.reviewer ?? "ops", step: opts.step });
    store.recordDecision(driverId, "human", choice, reasons, [], null, now, note, [], evidence);
    return d;
  });
}

export type BookingResult = { ok: true } | { ok: false; httpStatus: 403 | 404; message: string };

// The bookings lock. The API layer (Phase 4) turns a refusal into an HTTP 403.
export function tryBook(store: Store, driverId: string, today?: string): BookingResult {
  const d = store.getDriver(driverId);
  if (!d) return { ok: false, httpStatus: 404, message: "Driver not found." };
  if (d.status === "LICENCE_EXPIRED") return { ok: false, httpStatus: 403, message: "Your licence has expired. Upload your renewed licence to book loads." };
  if (!canBook(d.status)) return { ok: false, httpStatus: 403, message: "Finish verification to book loads." };
  // A verified driver also needs a verified vehicle (D-049).
  const vehicle = store.latestVehicle(driverId);
  if (vehicle?.outcome !== "APPROVE") return { ok: false, httpStatus: 403, message: "Add a verified vehicle to book loads." };
  // A registration that has run out since it was verified locks bookings, as a lapsed licence does.
  if (today && vehicle.record && vehicle.record.registeredTill < today) {
    return { ok: false, httpStatus: 403, message: "Your vehicle's registration has run out. Renew it, then add it again." };
  }
  return { ok: true };
}
