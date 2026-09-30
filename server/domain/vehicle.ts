import { namesMatch } from "./names";
import type { PartnerType, VehicleRecord } from "./types";

// The vehicle decision (D-049): may this vehicle carry this driver's loads? The rules live in
// policy/vehicle.rego; this module is their contract, as rules.ts is for the driver's KYC. It hands the
// policy facts, checks what comes back, and is the only place a vehicle decision is minted. Whatever
// the policy says, an approval needs the registry's record, a registration still valid, and an owner
// who is the driver or the driver's confirmed, verified fleet owner; otherwise it becomes a fix.

export type VehicleReasonCode =
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_NOT_GOODS"
  | "VEHICLE_REGISTRATION_EXPIRED"
  | "VEHICLE_OWNER_MISMATCH"
  | "VEHICLE_OWNER_NOT_VERIFIED"
  | "VEHICLE_OWNER_LINK_UNVERIFIED"
  | "VEHICLE_NOT_VERIFIED";
export type VehicleCheckCode = "VEHICLE_FOUND" | "VEHICLE_OWNER" | "VEHICLE_GOODS" | "VEHICLE_VALID";
export type VehicleOutcome = "APPROVE" | "NEEDS_FIX";

type Text = { en: string; hi: string };
export const VEHICLE_REASONS: Record<VehicleReasonCode, { driver: Text; ops: string }> = {
  VEHICLE_NOT_FOUND: {
    driver: { en: "We couldn't find that registration number. Check it and try again.", hi: "यह रजिस्ट्रेशन नंबर नहीं मिला। जाँचकर फिर कोशिश करें।" },
    ops: "No registration found for that number.",
  },
  VEHICLE_NOT_GOODS: {
    driver: { en: "This vehicle isn't registered to carry goods. Add a goods vehicle.", hi: "यह गाड़ी माल ढोने के लिए रजिस्टर्ड नहीं है। माल वाली गाड़ी जोड़ें।" },
    ops: "Not registered as a goods vehicle.",
  },
  VEHICLE_REGISTRATION_EXPIRED: {
    driver: { en: "This vehicle's registration has run out. Renew it, then add it again.", hi: "इस गाड़ी का रजिस्ट्रेशन ख़त्म हो गया है। रिन्यू कराकर फिर जोड़ें।" },
    ops: "Registration expired.",
  },
  VEHICLE_OWNER_MISMATCH: {
    driver: {
      en: "This vehicle is registered to someone else. Add one in your name, or your fleet owner's once they've confirmed you.",
      hi: "यह गाड़ी किसी और के नाम है। अपने नाम की गाड़ी जोड़ें, या फ़्लीट मालिक की, जब वे आपकी पुष्टि कर दें।",
    },
    ops: "Registered to neither the driver nor their fleet owner.",
  },
  VEHICLE_OWNER_NOT_VERIFIED: {
    driver: {
      en: "This is your fleet owner's vehicle, and their own KYC isn't finished yet. You can add it once they're verified.",
      hi: "यह आपके फ़्लीट मालिक की गाड़ी है, और उनका अपना KYC अभी पूरा नहीं हुआ है। उनके वेरिफ़ाई होने पर इसे जोड़ सकते हैं।",
    },
    ops: "The fleet owner's vehicle, but the owner isn't verified.",
  },
  VEHICLE_OWNER_LINK_UNVERIFIED: {
    driver: {
      en: "This is your fleet owner's vehicle. Ask them to confirm you in their app, then add it again.",
      hi: "यह आपके फ़्लीट मालिक की गाड़ी है। उनसे अपने ऐप में आपकी पुष्टि करवाएँ, फिर इसे दोबारा जोड़ें।",
    },
    ops: "The fleet owner's vehicle, but the owner hasn't confirmed this driver.",
  },
  VEHICLE_NOT_VERIFIED: {
    driver: { en: "We couldn't verify this vehicle. Try again, or ask for help.", hi: "हम इस गाड़ी को वेरिफ़ाई नहीं कर पाए। फिर कोशिश करें, या मदद माँगें।" },
    ops: "An approval the contract wouldn't let through.",
  },
};
const CHECKS: readonly VehicleCheckCode[] = ["VEHICLE_FOUND", "VEHICLE_OWNER", "VEHICLE_GOODS", "VEHICLE_VALID"];
// The classes that carry goods: the policy's list, repeated here so the contract checks it independently.
const GOODS_CLASSES: readonly string[] = ["LGV", "MGV", "HGV", "GOODS"];

// The facts the app gathers: the number the driver typed, the registry's answer, and who they are.
// Names are the names of record, as KYC uses them: the licence registry's, else the PAN registry's, and
// the name typed at sign-up only when neither registry answers (KYC's own identity rule).
export interface VehicleFacts {
  number: string;
  record: VehicleRecord | null; // null: no registration for that number
  driver: { identity: string; partnerType: PartnerType; ownerLinkVerified: boolean };
  fleetOwnerIdentity: string | null;
  ownerVerified: boolean;
  today: string; // IST calendar date, YYYY-MM-DD
  registrySimulated: boolean;
}

export interface VehicleReason {
  code: VehicleReasonCode;
  evidence: Record<string, unknown>;
}
export interface VehicleCheck {
  check: VehicleCheckCode;
  evidence: Record<string, unknown>;
  simulated: boolean;
}
export interface VehicleDecision {
  outcome: VehicleOutcome;
  reasons: VehicleReason[];
  passed: VehicleCheck[];
  rulesVersion: string;
}

export type VehicleEntrypoint = "vehicle/decision" | "vehicle/version";
export interface VehicleEngine {
  evaluate(entrypoint: VehicleEntrypoint, input: unknown): unknown;
}

export class VehicleContractError extends Error {}
const reject = (why: string): never => {
  throw new VehicleContractError(`Vehicle policy output rejected: ${why}`);
};
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Name matching stays in TypeScript (transliteration, initials), as for the driver's KYC.
export function vehicleInput(f: VehicleFacts) {
  const owner = f.record?.ownerName;
  return {
    today: f.today,
    registrySimulated: f.registrySimulated,
    vehicle: { number: f.number, status: f.record ? "found" : "not_found", record: f.record },
    owner: {
      matchesDriver: owner ? namesMatch(owner, f.driver.identity).match : null,
      matchesFleetOwner: owner && f.fleetOwnerIdentity ? namesMatch(owner, f.fleetOwnerIdentity).match : null,
    },
    driver: { partnerType: f.driver.partnerType, ownerLinkVerified: f.driver.ownerLinkVerified },
    ownerVerified: f.ownerVerified,
  };
}

// The last line of defence, independent of the policy.
function approvalBlocker(f: VehicleFacts, passed: readonly VehicleCheck[]): string | null {
  if (!f.record) return "approval without a registration";
  const missing = CHECKS.filter((c) => !passed.some((p) => p.check === c));
  if (missing.length > 0) return `approval without passed checks: ${missing.join(", ")}`;
  if (f.record.registeredTill < f.today) return "approval of an expired registration";
  if (!GOODS_CLASSES.includes(f.record.vehicleClass)) return "approval of a vehicle that doesn't carry goods";
  const input = vehicleInput(f);
  const ownerOk =
    input.owner.matchesDriver === true ||
    (f.driver.partnerType === "hired_driver" && input.owner.matchesFleetOwner === true && f.driver.ownerLinkVerified && f.ownerVerified);
  if (!ownerOk) return "approval of someone else's vehicle";
  return null;
}

const issued = new WeakSet<VehicleDecision>();
export function isIssuedVehicleDecision(d: VehicleDecision): boolean {
  return issued.has(d);
}
function mint(d: VehicleDecision): VehicleDecision {
  Object.freeze(d);
  d.reasons.forEach((r) => Object.freeze(r));
  d.passed.forEach((p) => Object.freeze(p));
  issued.add(d);
  return d;
}

const CANARY: VehicleFacts = {
  number: "KA00CANARY0",
  record: null,
  driver: { identity: "CANARY", partnerType: "owner_driver", ownerLinkVerified: false },
  fleetOwnerIdentity: null,
  ownerVerified: false,
  today: "2026-01-01",
  registrySimulated: true,
};

export interface VehicleRules {
  version: string;
  decide(f: VehicleFacts): VehicleDecision;
}

// Wraps the policy engine in the contract. Only server/policy creates the app's (tested).
export function makeVehicleRules(engine: VehicleEngine): VehicleRules {
  const stamped = engine.evaluate("vehicle/version", {});
  if (typeof stamped !== "string" || stamped === "") reject("the vehicle policy has no version");
  const version = stamped as string;

  function decide(f: VehicleFacts): VehicleDecision {
    const raw = engine.evaluate("vehicle/decision", vehicleInput(f));
    if (!isObject(raw)) return reject("no decision");
    if (raw.version !== version) reject(`decision made by vehicle policy ${String(raw.version)}, expected ${version}`);
    if (raw.outcome !== "APPROVE" && raw.outcome !== "NEEDS_FIX") reject(`unknown outcome ${String(raw.outcome)}`);
    if (!Array.isArray(raw.reasons) || !Array.isArray(raw.passed)) reject("reasons or checks missing");
    const byRank = (a: { rank: number }, b: { rank: number }) => a.rank - b.rank;
    const reasons = (raw.reasons as unknown[])
      .map((r) => {
        if (!isObject(r) || !(String(r.code) in VEHICLE_REASONS) || typeof r.rank !== "number") return reject(`malformed reason ${JSON.stringify(r)}`);
        return { rank: r.rank, reason: { code: r.code as VehicleReasonCode, evidence: isObject(r.evidence) ? r.evidence : {} } };
      })
      .sort(byRank)
      .map((x) => x.reason);
    const passed = (raw.passed as unknown[])
      .map((p) => {
        if (!isObject(p) || !CHECKS.includes(p.check as VehicleCheckCode) || typeof p.rank !== "number" || typeof p.simulated !== "boolean") {
          return reject(`malformed check ${JSON.stringify(p)}`);
        }
        return { rank: p.rank, passed: { check: p.check as VehicleCheckCode, evidence: isObject(p.evidence) ? p.evidence : {}, simulated: p.simulated } };
      })
      .sort(byRank)
      .map((x) => x.passed);
    if ((raw.outcome === "APPROVE") !== (reasons.length === 0)) reject(`outcome ${String(raw.outcome)} doesn't follow from its reasons`);
    const blocker = raw.outcome === "APPROVE" ? approvalBlocker(f, passed) : null;
    if (blocker) {
      return mint({ outcome: "NEEDS_FIX", reasons: [{ code: "VEHICLE_NOT_VERIFIED", evidence: { invariant: blocker, caughtBy: "contract" } }], passed, rulesVersion: version });
    }
    return mint({ outcome: raw.outcome as VehicleOutcome, reasons, passed, rulesVersion: version });
  }

  decide(CANARY); // a stale or mismatched build fails at startup, not on a driver
  return { version, decide };
}
