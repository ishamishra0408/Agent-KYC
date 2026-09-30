import { policyInput, policyReading } from "./policyInput";
import { NOTICES, REASONS } from "./reasons";
import { istDate } from "./time";
import type { CheckCode, Decision, DocReading, DocType, Evidence, Notice, NoticeCode, Outcome, PassedCheck, Reason, ReasonCode } from "./types";

// The decision rules live in policy/kyc.rego and run on Open Policy Agent (D-030). This module is
// the contract around them: it hands the policy facts, checks what comes back, and is the only
// place a Decision is minted. Whatever the policy says:
//   - the answer must have the right shape, and each reason must be in the catalogue with the
//     same severity (so a review reason can never be worded as a fix, or the reverse);
//   - the outcome must follow from the reasons: review outranks fix, approve only with none;
//   - an approval without the five core checks passed, on an expired licence, or with hidden
//     instructions on a document, is not let through: it goes to a person instead.
// It also checks the policy once at startup, so a stale or mismatched build fails there (F-020).

export type PolicyEntrypoint = "kyc/decision" | "kyc/photo_check" | "kyc/renewal" | "kyc/severities" | "kyc/version";

export interface PolicyEngine {
  evaluate(entrypoint: PolicyEntrypoint, input: unknown): unknown;
}

export class PolicyContractError extends Error {}

export interface Rules {
  version: string;
  decide(e: Evidence): Decision;
  photoIssue(r: DocReading, slot: DocType): ReasonCode | null;
  licenceWindow(daysLeft: number | null): { due: boolean; expired: boolean };
}

// Decisions minted by a rules engine. Anything else handed to the onboarding service is refused,
// so no other code (an AI tool, a bug, a hand-built object) can pass off an approval.
const issued = new WeakSet<Decision>();

export function isIssuedByRules(d: Decision): boolean {
  return issued.has(d);
}

const OUTCOMES: readonly Outcome[] = ["APPROVE", "NEEDS_FIX", "REVIEW"];
const CHECKS: readonly CheckCode[] = ["PHOTOS_OK", "DL_VALID", "PAN_FOUND", "SAME_PERSON", "BANK_VERIFIED", "FACE_MATCH"];
const DOCS: readonly DocType[] = ["DL", "PAN", "BANK_PROOF"];
const CORE_CHECKS: readonly CheckCode[] = ["DL_VALID", "PAN_FOUND", "SAME_PERSON", "BANK_VERIFIED", "FACE_MATCH"];

// An empty submission: at startup, the policy must give it a well-formed answer.
const CANARY: Evidence = {
  driver: { id: "canary", name: "Canary", phone: "", partnerType: "owner_driver" },
  readings: {},
  digilocker: {},
  dlRecord: undefined,
  panRecord: undefined,
  bank: null,
  face: "not_checked",
  owner: null,
  ownerVerified: false,
  graph: { status: "ok", sharedBankAccount: null },
  priorFixReasons: [],
  registrySimulated: true,
  now: new Date(0),
};

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isCode = (v: unknown): v is ReasonCode => typeof v === "string" && Object.hasOwn(REASONS, v);

function reject(what: string): never {
  throw new PolicyContractError(`Policy answer rejected: ${what}`);
}

function catalogued(code: ReasonCode, doc?: DocType, evidence?: Obj): Reason {
  const info = REASONS[code];
  const r: Reason = { code, severity: info.severity, driverMessage: info.driver.en, opsMessage: info.ops };
  if (doc) r.doc = doc;
  if (evidence) r.evidence = evidence;
  return r;
}

function toReason(raw: unknown): { rank: number; reason: Reason } {
  if (!isObject(raw)) reject("a reason isn't an object");
  const { code, severity, rank, doc, evidence } = raw;
  if (!isCode(code)) reject(`unknown reason code ${String(code)}`);
  if (severity !== REASONS[code].severity) reject(`${code} is "${String(severity)}" in the policy but "${REASONS[code].severity}" in the catalogue`);
  if (typeof rank !== "number" || !Number.isFinite(rank)) reject(`${code} has no rank`);
  if (doc !== null && !DOCS.includes(doc as DocType)) reject(`${code} names an unknown document`);
  if (evidence !== null && !isObject(evidence)) reject(`${code} has malformed evidence`);
  return { rank, reason: catalogued(code, (doc ?? undefined) as DocType | undefined, (evidence ?? undefined) as Obj | undefined) };
}

function toPassed(raw: unknown): { rank: number; passed: PassedCheck } {
  if (!isObject(raw)) reject("a passed check isn't an object");
  const { check, rank, evidence, simulated } = raw;
  if (!CHECKS.includes(check as CheckCode)) reject(`unknown check ${String(check)}`);
  if (typeof rank !== "number" || !isObject(evidence) || typeof simulated !== "boolean") reject(`malformed check ${String(check)}`);
  return { rank, passed: { check: check as CheckCode, evidence, simulated } };
}

function toNotice(raw: unknown): Notice {
  if (!isObject(raw) || typeof raw.code !== "string" || !Object.hasOwn(NOTICES, raw.code)) reject(`unknown notice ${JSON.stringify(raw)}`);
  if (!isObject(raw.evidence)) reject(`notice ${raw.code} has malformed evidence`);
  const code = raw.code as NoticeCode;
  return { code, opsMessage: NOTICES[code].ops, evidence: raw.evidence };
}

const byRank = <T extends { rank: number }>(a: T, b: T) => a.rank - b.rank;

function outcomeOf(reasons: readonly Reason[]): Outcome {
  if (reasons.some((r) => r.severity === "review")) return "REVIEW";
  return reasons.length > 0 ? "NEEDS_FIX" : "APPROVE";
}

// The last line of defence, independent of the policy: no approval without the evidence and the
// five core checks, on an expired licence, without an answer from the trust graph, with text aimed
// at the verification system, or on a document that looks edited.
function approvalBlocker(e: Evidence, passed: readonly PassedCheck[]): string | null {
  if (!e.dlRecord || !e.panRecord || e.bank === null || e.face !== "match") return "approval without full evidence";
  const missing = CORE_CHECKS.filter((c) => !passed.some((p) => p.check === c));
  if (missing.length > 0) return `approval without passed checks: ${missing.join(", ")}`;
  if (e.dlRecord.validTill < istDate(e.now)) return "approval with an expired licence";
  if (e.graph.status !== "ok") return "approval without an answer from the trust graph";
  if (Object.values(e.readings).some((r) => r && (policyReading(r).suspiciousText ?? "") !== "")) {
    return "approval with hidden instructions on a document";
  }
  if (Object.values(e.readings).some((r) => r && (policyReading(r).tamperSigns ?? "") !== "")) return "approval of a document that looks edited";
  return null;
}

function freezeDeep<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) freezeDeep(x);
  }
  return v;
}

function mint(d: Decision): Decision {
  freezeDeep(d);
  issued.add(d);
  return d;
}

// Wraps a policy engine in the contract. Only server/policy creates the app's engine (tested).
export function makeRules(engine: PolicyEngine): Rules {
  const stamped = engine.evaluate("kyc/version", {});
  if (typeof stamped !== "string" || stamped === "") reject("the policy has no version");
  const version: string = stamped;

  function decide(e: Evidence): Decision {
    const raw = engine.evaluate("kyc/decision", policyInput(e));
    if (!isObject(raw)) reject("no decision");
    if (!OUTCOMES.includes(raw.outcome as Outcome)) reject(`unknown outcome ${String(raw.outcome)}`);
    if (raw.version !== version) reject(`decision made by policy ${String(raw.version)}, expected ${version}`);
    if (!Array.isArray(raw.reasons) || !Array.isArray(raw.passed) || !Array.isArray(raw.notices)) reject("reasons, checks or notices missing");

    const reasons = raw.reasons.map(toReason).sort(byRank).map((x) => x.reason);
    const passed = raw.passed.map(toPassed).sort(byRank).map((x) => x.passed);
    const notices = raw.notices.map(toNotice);
    if (raw.outcome !== outcomeOf(reasons)) reject(`outcome ${String(raw.outcome)} doesn't follow from its reasons`);

    const blocker = raw.outcome === "APPROVE" ? approvalBlocker(e, passed) : null;
    if (blocker) {
      const guarded = [...reasons, catalogued("LOW_CONFIDENCE", undefined, { invariant: blocker, caughtBy: "contract" })];
      return mint({ outcome: outcomeOf(guarded), reasons: guarded, passed, notices, rulesVersion: version });
    }
    return mint({ outcome: raw.outcome as Outcome, reasons, passed, notices, rulesVersion: version });
  }

  // The photo standard, shared by instant coaching and the decision (D-022).
  function photoIssue(r: DocReading, slot: DocType): ReasonCode | null {
    const raw = engine.evaluate("kyc/photo_check", { reading: policyReading(r), slot });
    if (!isObject(raw)) reject("no photo check");
    if (raw.issue === null) return null;
    if (!isCode(raw.issue)) reject(`unknown photo issue ${String(raw.issue)}`);
    return raw.issue;
  }

  // Questions 3 and 9 (D-031, D-032): is an approved driver's licence due for renewal, or lapsed?
  function licenceWindow(daysLeft: number | null): { due: boolean; expired: boolean } {
    const raw = engine.evaluate("kyc/renewal", { daysLeft });
    if (!isObject(raw) || typeof raw.due !== "boolean" || typeof raw.expired !== "boolean") reject("no licence window answer");
    return { due: raw.due, expired: raw.expired };
  }

  // Startup check: the policy and the catalogue agree on every code, and a decision comes back well formed.
  const severities = engine.evaluate("kyc/severities", {});
  if (!isObject(severities)) reject("no severity table");
  for (const code of new Set([...Object.keys(REASONS), ...Object.keys(severities)])) {
    const catalogue = isCode(code) ? REASONS[code].severity : undefined;
    if (severities[code] !== catalogue) reject(`${code} is "${String(severities[code])}" in the policy but "${String(catalogue)}" in the catalogue`);
  }
  decide(CANARY);

  return { version, decide, photoIssue, licenceWindow };
}
