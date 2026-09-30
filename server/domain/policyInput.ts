import { namesMatch } from "./names";
import { daysBetween, istDate } from "./time";
import type {
  BankRecord,
  DlRecord,
  DocReading,
  DocType,
  Evidence,
  FaceResult,
  GraphSignals,
  PanRecord,
  PartnerType,
  ReasonCode,
} from "./types";

// The facts the policy (policy/kyc.rego) decides on. Everything here is an observation: what the
// reader saw, what the registries returned, and name comparisons. No judgement happens here.
// Name matching stays in TypeScript: it's an algorithm (transliteration, initials), not policy.

export type RecordStatus = "not_checked" | "not_found" | "found";

export interface PolicyReading {
  docType: DocReading["docType"];
  quality: string;
  isScreenPhoto: boolean;
  suspiciousText: string | null;
  tamperSigns: string | null;
  confidence: number | null; // NaN and other non-numbers become null
  fields: DocReading["fields"];
}

export interface PolicyInput {
  today: string; // IST calendar date, YYYY-MM-DD
  driver: { partnerType: PartnerType; ownerLinkVerified: boolean };
  owner: { name: string; partnerType: PartnerType } | null;
  ownerVerified: boolean;
  readings: Partial<Record<DocType, PolicyReading>>;
  digilocker: Partial<Record<"DL" | "PAN", true>>;
  dl: { status: RecordStatus; record: DlRecord | null; daysLeft: number | null }; // 0 on the last valid day
  pan: { status: RecordStatus; record: PanRecord | null };
  bank: BankRecord | null;
  face: FaceResult;
  sharedBankAccount: GraphSignals["sharedBankAccount"];
  graphStatus: "ok" | "unavailable"; // anything but a clear "ok" counts as unavailable
  priorFixReasons: ReasonCode[][];
  registrySimulated: boolean;
  identity: string; // the name a bank account must match: licence, else PAN, else the signup name
  // true/false once both names exist; null when there's nothing to compare.
  names: {
    licencePrinted: boolean | null;
    panPrinted: boolean | null;
    licenceVsPan: boolean | null;
    bankVsIdentity: boolean | null;
    bankVsOwner: boolean | null;
    passbookVsBank: boolean | null;
  };
}

// A reader's output is a proposal and may be malformed (an AI reader especially). Anything missing
// or of the wrong type becomes a value the policy treats as a problem, never as "fine": an unknown
// quality is not "ok", an unknown document type matches no slot, and any non-empty hidden-text flag
// counts as hidden text.
export function policyReading(r: DocReading): PolicyReading {
  const hidden = r.suspiciousText as unknown;
  const edited = r.tamperSigns as unknown;
  return {
    docType: typeof r.docType === "string" ? r.docType : ("UNKNOWN" as DocReading["docType"]),
    quality: typeof r.quality === "string" ? r.quality : "unknown",
    isScreenPhoto: Boolean(r.isScreenPhoto),
    suspiciousText: typeof hidden === "string" ? hidden : hidden === null || hidden === undefined || hidden === false ? null : String(hidden),
    tamperSigns: typeof edited === "string" ? edited : edited === null || edited === undefined || edited === false ? null : String(edited),
    confidence: typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : null,
    fields: r.fields ?? {},
  };
}

const status = (record: unknown): RecordStatus => (record === undefined ? "not_checked" : record === null ? "not_found" : "found");

// A printed name is compared only if the reader found one. Registry names are always compared, so an
// empty registry name is a mismatch, not a pass.
const printedVs = (printed: string | undefined, registry: string | undefined, have: unknown): boolean | null =>
  printed && have ? namesMatch(printed, registry ?? "").match : null;

export function policyInput(e: Evidence): PolicyInput {
  const readings: PolicyInput["readings"] = {};
  for (const doc of ["DL", "PAN", "BANK_PROOF"] as const) {
    const r = e.readings[doc];
    if (r) readings[doc] = policyReading(r);
  }
  const identity = e.dlRecord?.name ?? e.panRecord?.name ?? e.driver.name;
  const today = istDate(e.now);
  return {
    today,
    driver: { partnerType: e.driver.partnerType, ownerLinkVerified: e.driver.ownerLinkVerified === true },
    owner: e.owner ? { name: e.owner.name, partnerType: e.owner.partnerType } : null,
    ownerVerified: e.ownerVerified,
    readings,
    digilocker: { ...e.digilocker },
    dl: { status: status(e.dlRecord), record: e.dlRecord ?? null, daysLeft: e.dlRecord ? daysBetween(today, e.dlRecord.validTill) : null },
    pan: { status: status(e.panRecord), record: e.panRecord ?? null },
    bank: e.bank,
    face: e.face,
    sharedBankAccount: e.graph.sharedBankAccount,
    graphStatus: e.graph.status === "ok" ? "ok" : "unavailable",
    priorFixReasons: e.priorFixReasons,
    registrySimulated: e.registrySimulated,
    identity,
    names: {
      licencePrinted: printedVs(e.readings.DL?.fields.name, e.dlRecord?.name, e.dlRecord),
      panPrinted: printedVs(e.readings.PAN?.fields.name, e.panRecord?.name, e.panRecord),
      licenceVsPan: e.dlRecord && e.panRecord ? namesMatch(e.dlRecord.name, e.panRecord.name).match : null,
      bankVsIdentity: e.bank ? namesMatch(e.bank.holderName, identity).match : null,
      bankVsOwner: e.bank && e.owner ? namesMatch(e.bank.holderName, e.owner.name).match : null,
      passbookVsBank: printedVs(e.readings.BANK_PROOF?.fields.holderName, e.bank?.holderName, e.bank),
    },
  };
}
