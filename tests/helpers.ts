import { decide } from "../server/policy";
import type { Decision, DocReading, DocType, Driver, Evidence } from "../server/domain/types";

export const NOW = new Date("2026-09-28T10:00:00+05:30");

export function reading(docType: DocType, fields: DocReading["fields"], over: Partial<DocReading> = {}): DocReading {
  return { docType, quality: "ok", isScreenPhoto: false, suspiciousText: null, fields, confidence: 0.95, ...over };
}

export const ramesh: Driver = { id: "d1", name: "Ramesh Kumar", phone: "+91 00000 00001", partnerType: "owner_driver" };

// A submission where every check passes.
export function cleanEvidence(over: Partial<Evidence> = {}): Evidence {
  return {
    driver: ramesh,
    readings: {
      DL: reading("DL", { name: "RAMESH KUMAR", number: "KA0120150004821" }),
      PAN: reading("PAN", { name: "RAMESH KUMAR", number: "SPEPK4821R" }),
      BANK_PROOF: reading("BANK_PROOF", { holderName: "RAMESH KUMAR" }),
    },
    digilocker: {},
    dlRecord: { number: "KA0120150004821", name: "RAMESH KUMAR", dob: "1988-03-14", validTill: "2035-03-13" },
    panRecord: { number: "SPEPK4821R", name: "RAMESH KUMAR", dob: "1988-03-14" },
    bank: { accountId: "a1", holderName: "RAMESH KUMAR", accountLast4: "4821", ifsc: "SPEC0000101" },
    face: "match",
    owner: null,
    ownerVerified: false,
    graph: { status: "ok", sharedBankAccount: null },
    priorFixReasons: [],
    registrySimulated: true,
    now: NOW,
    ...over,
  };
}

// Real decisions from the rules engine. The onboarding service refuses hand-built ones.
export const decisions = {
  approve: (): Decision => decide(cleanEvidence()),
  review: (): Decision => decide(cleanEvidence({ face: "no_match" })),
  blurryLicence: (): Decision =>
    decide(
      cleanEvidence({
        readings: { ...cleanEvidence().readings, DL: reading("DL", {}, { quality: "blurry", confidence: 0.9 }) },
        dlRecord: undefined,
      }),
    ),
};
