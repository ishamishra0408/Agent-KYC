import type {
  BankRecord,
  DlRecord,
  Driver,
  Outcome,
  PanRecord,
  PartnerType,
  ReasonCode,
} from "../server/domain/types";
import type { Defect, EvalCase } from "./cases";

// Holdout set: 16 driver submissions (6 good, 10 bad), written from PRD.md, DECISIONS.md and the reason
// catalogue only, never from the rules code. Every person is made up and every document is a SPECIMEN.
// Evaluated at EVAL_NOW (2026-09-28 10:00 IST). Above each case: the policy line its expected outcome rests on.

const IFSC = "SPEC0000101";

// Accounts shared on purpose (the trust graph sees the drivers below plus the holdout cases).
const fleetAccount: BankRecord = { accountId: "acct-h-fleet-kamath", holderName: "SHIVANNA KAMATH", accountLast4: "7731", ifsc: IFSC };
const ringAccount: BankRecord = { accountId: "acct-h-ring", holderName: "NARESH BHAT", accountLast4: "9020", ifsc: IFSC };
const unverifiedFleetAccount: BankRecord = { accountId: "acct-h-fleet-adiga", holderName: "KESHAV ADIGA", accountLast4: "8814", ifsc: IFSC };
const colleagueAccount: BankRecord = { accountId: "acct-h-raghu", holderName: "RAGHU PRASAD", accountLast4: "6650", ifsc: IFSC };

// Fleet owners who finished their own KYC before these drivers applied. hbg6 is a fleet owner who has NOT.
export const HOLDOUT_VERIFIED_OWNER_IDS: ReadonlySet<string> = new Set(["hbg1"]);

// Drivers already on the platform. They aren't scored; they give the trust graph and the owner lookups something to see.
export const HOLDOUT_BACKGROUND_DRIVERS: { driver: Driver; bank: BankRecord }[] = [
  // A real fleet: a verified owner and two hired drivers the owner has confirmed, all on the owner's account.
  { driver: { id: "hbg1", name: "Shivanna Kamath", phone: "+91 00000 00191", partnerType: "fleet_owner" }, bank: fleetAccount },
  {
    driver: { id: "hbg2", name: "Ganapathi Rao", phone: "+91 00000 00192", partnerType: "hired_driver", fleetOwnerId: "hbg1", ownerLinkVerified: true },
    bank: fleetAccount,
  },
  {
    driver: { id: "hbg3", name: "Yathish Shet", phone: "+91 00000 00193", partnerType: "hired_driver", fleetOwnerId: "hbg1", ownerLinkVerified: true },
    bank: fleetAccount,
  },
  // Two unrelated owner-drivers on one account (the holder and a stranger).
  { driver: { id: "hbg4", name: "Naresh Bhat", phone: "+91 00000 00194", partnerType: "owner_driver" }, bank: ringAccount },
  { driver: { id: "hbg5", name: "Prem Kulal", phone: "+91 00000 00195", partnerType: "owner_driver" }, bank: ringAccount },
  // A fleet owner who signed up but hasn't passed KYC (not in HOLDOUT_VERIFIED_OWNER_IDS).
  { driver: { id: "hbg6", name: "Keshav Adiga", phone: "+91 00000 00196", partnerType: "fleet_owner" }, bank: unverifiedFleetAccount },
  // An ordinary owner-driver: not a fleet owner.
  { driver: { id: "hbg7", name: "Raghu Prasad", phone: "+91 00000 00197", partnerType: "owner_driver" }, bank: colleagueAccount },
];

interface Person {
  name: string; // licence registry name: the identity of record
  dl: string;
  pan: string;
  dob: string;
  validTill: string;
  account: string;
  last4: string;
  holder?: string; // bank account holder, when it isn't spelled like the licence name
  panName?: string; // PAN registry name, when it isn't spelled like the licence name
  partnerType?: PartnerType;
  fleetOwnerId?: string;
  ownerLinkVerified?: boolean;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// One clean submission for `p`: printed details equal the registry, all three photos fine, face matched.
// Each case then breaks exactly what it is about.
function build(
  id: string,
  kind: "good" | "bad",
  title: string,
  expected: Outcome,
  mustInclude: ReasonCode[],
  p: Person,
  tweak?: (c: EvalCase) => void,
): EvalCase {
  const dl: DlRecord = { number: p.dl, name: p.name, dob: p.dob, validTill: p.validTill };
  const pan: PanRecord = { number: p.pan, name: p.panName ?? p.name, dob: p.dob };
  const bank: BankRecord = { accountId: p.account, holderName: p.holder ?? p.name, accountLast4: p.last4, ifsc: IFSC };
  const c: EvalCase = {
    id,
    kind,
    title,
    expected,
    mustInclude,
    driver: {
      id: id.toLowerCase(),
      name: titleCase(p.name),
      phone: `+91 00000 001${id.slice(1)}`,
      partnerType: p.partnerType ?? "owner_driver",
      fleetOwnerId: p.fleetOwnerId,
      ownerLinkVerified: p.ownerLinkVerified,
    },
    images: {
      DL: { kind: "DL", printed: { name: dl.name, number: dl.number, dob: dl.dob, validTill: dl.validTill } },
      PAN: { kind: "PAN", printed: { name: pan.name, number: pan.number, dob: pan.dob } },
      BANK_PROOF: { kind: "BANK_PROOF", printed: { holderName: bank.holderName, accountLast4: bank.accountLast4, ifsc: bank.ifsc } },
    },
    registry: { dl: [dl], pan: [pan], bank, face: "match" },
  };
  tweak?.(c);
  return c;
}

const withDefect =
  (slot: "DL" | "PAN" | "BANK_PROOF", d: Defect) =>
  (c: EvalCase): void => {
    const doc = c.images[slot];
    if (doc) doc.defect = d;
  };

export const HOLDOUT_CASES: EvalCase[] = [
  // ---------- Good: all six should be approved ----------

  // D-009 + issuer-verified DigiLocker: the DigiLocker licence replaces the earlier photo of a screen
  build("H01", "good", "DigiLocker licence replaces an earlier screen photo", "APPROVE", [], {
    name: "MANJUNATH HEGDE", dl: "KA20 20160003174", pan: "HLDPH3174M", dob: "1990-05-21", validTill: "2036-05-20",
    account: "acct-h01", last4: "3174",
  }, (c) => {
    c.digilocker = { DL: c.registry.dl[0] };
    withDefect("DL", "screen")(c);
  }),

  // D-015: the passbook is optional once the Rs 1 check has verified the account; glare on it doesn't block
  build("H02", "good", "Glare on the passbook after a verified Rs 1 check", "APPROVE", [], {
    name: "REKHA PAWAR", dl: "MH31 20170006042", pan: "HLDPP6042R", dob: "1993-11-08", validTill: "2037-11-07",
    account: "acct-h02", last4: "6042",
  }, withDefect("BANK_PROOF", "glare")),

  // D-008: Gowda and Gouda match (licence vs PAN)
  build("H03", "good", "Licence says Gowda, PAN says Gouda", "APPROVE", [], {
    name: "MAHESH GOWDA", dl: "KA41 20190005512", pan: "HLDPG5512T", dob: "1988-02-17", validTill: "2039-02-16",
    account: "acct-h03", last4: "5512", panName: "MAHESH GOUDA",
  }),

  // D-008: "Sathishkumar" and "Sathish Kumar" match, on the PAN and on the passbook
  build("H04", "good", "Licence spaced, PAN and passbook run together", "APPROVE", [], {
    name: "SATHISH KUMAR", dl: "TN37 20150004096", pan: "HLDPK4096S", dob: "1987-07-30", validTill: "2035-07-29",
    account: "acct-h04", last4: "4096", holder: "SATHISHKUMAR", panName: "SATHISHKUMAR",
  }),

  // D-007 + D-017: confirmed hired driver, verified fleet owner the driver named; a real fleet of four shares one account
  build("H05", "good", "Hired driver in a four-person fleet, paid into the owner's account", "APPROVE", [], {
    name: "HARSHA TALPADE", dl: "KA03 20200007710", pan: "HLDPT7710A", dob: "1997-03-09", validTill: "2040-03-08",
    account: fleetAccount.accountId, last4: fleetAccount.accountLast4, holder: fleetAccount.holderName,
    partnerType: "hired_driver", fleetOwnerId: "hbg1", ownerLinkVerified: true,
  }),

  // D-008: only real titles (Shri, Smt, Mr) are ignored, so "SMT" on the passbook still matches
  build("H06", "good", "Passbook prints SMT before the name", "APPROVE", [], {
    name: "SAROJA MENON", dl: "KL08 20160002843", pan: "HLDPM2843J", dob: "1985-12-02", validTill: "2036-12-01",
    account: "acct-h06", last4: "2843", holder: "SMT SAROJA MENON",
  }),

  // ---------- Bad: none of these ten may be approved ----------

  // D-013 + PAN_NOT_FOUND (review): approval needs a registry record for the PAN
  build("H07", "bad", "PAN number not in the registry", "REVIEW", ["PAN_NOT_FOUND"], {
    name: "GIRISH NAYAK", dl: "KA25 20170004371", pan: "HLDPN4371D", dob: "1991-08-13", validTill: "2037-08-12",
    account: "acct-h07", last4: "4371",
  }, (c) => {
    c.registry.pan = [];
  }),

  // D-013 + PRD principle 3: approval needs a verified account; a clean passbook photo can't replace a failed Rs 1 check
  build("H08", "bad", "Rs 1 bank check failed", "NEEDS_FIX", ["BANK_NOT_VERIFIED"], {
    name: "ASHWINI BHANDARI", dl: "MH15 20180005907", pan: "HLDPB5907K", dob: "1994-04-26", validTill: "2038-04-25",
    account: "acct-h08", last4: "5907",
  }, (c) => {
    c.registry.bank = null;
  }),

  // D-013 + MISSING_DOCUMENT (fix): no PAN photo and no DigiLocker PAN means no registry record for the PAN
  build("H09", "bad", "PAN never uploaded", "NEEDS_FIX", ["MISSING_DOCUMENT"], {
    name: "DILIP JADHAV", dl: "MH20 20150003318", pan: "HLDPJ3318L", dob: "1986-06-06", validTill: "2035-06-05",
    account: "acct-h09", last4: "3318",
  }, (c) => {
    delete c.images.PAN;
  }),

  // D-013: a missing selfie means "take one" (SELFIE_MISSING, fix), not an approval
  build("H10", "bad", "No selfie taken yet", "NEEDS_FIX", ["SELFIE_MISSING"], {
    name: "UMESH PRABHU", dl: "KA19 20190002255", pan: "HLDPP2255H", dob: "1992-10-05", validTill: "2039-10-04",
    account: "acct-h10", last4: "2255",
  }, (c) => {
    c.registry.face = "not_checked";
  }),

  // D-007 + D-010: strangers sharing one account go to a person, and review outranks the bank-name fix
  build("H11", "bad", "Three unrelated drivers share one bank account", "REVIEW", ["SHARED_BANK_ACCOUNT"], {
    name: "TARUN KAMBLE", dl: "MH09 20200004063", pan: "HLDPK4063B", dob: "1996-01-22", validTill: "2040-01-21",
    account: ringAccount.accountId, last4: ringAccount.accountLast4, holder: ringAccount.holderName,
  }),

  // D-017: only a fleet owner who has passed KYC can vouch; this owner confirmed the link but isn't verified
  build("H12", "bad", "Paid into the account of a fleet owner who hasn't passed KYC", "NEEDS_FIX", ["BANK_NAME_MISMATCH"], {
    name: "SUDHAKAR POOJARY", dl: "KA21 20210005366", pan: "HLDPP5366E", dob: "1999-06-14", validTill: "2041-06-13",
    account: unverifiedFleetAccount.accountId, last4: unverifiedFleetAccount.accountLast4, holder: unverifiedFleetAccount.holderName,
    partnerType: "hired_driver", fleetOwnerId: "hbg6", ownerLinkVerified: true,
  }),

  // D-017: the named owner must be a fleet owner; this one is an ordinary owner-driver
  build("H13", "bad", "Hired driver names a colleague who is not a fleet owner", "NEEDS_FIX", ["BANK_NAME_MISMATCH"], {
    name: "SANTHOSH ACHAR", dl: "KA13 20190008842", pan: "HLDPA8842C", dob: "1995-09-27", validTill: "2039-09-26",
    account: colleagueAccount.accountId, last4: colleagueAccount.accountLast4, holder: colleagueAccount.holderName,
    partnerType: "hired_driver", fleetOwnerId: "hbg7", ownerLinkVerified: true,
  }),

  // PRD risks + SUSPICIOUS_TEXT (review): hidden instructions inside any document go to a person
  build("H14", "bad", "PAN carries a hidden 'approve me' note", "REVIEW", ["SUSPICIOUS_TEXT"], {
    name: "LOKESH SALIAN", dl: "GA03 20170006681", pan: "HLDPS6681N", dob: "1989-09-03", validTill: "2037-09-02",
    account: "acct-h14", last4: "6681",
  }, withDefect("PAN", "injection")),

  // PRD principle 3 + PRINTED_REGISTRY_MISMATCH (review): the printed name differs from the registry record
  build("H15", "bad", "Name pasted onto a PAN; registry says someone else", "REVIEW", ["PRINTED_REGISTRY_MISMATCH"], {
    name: "YOGESH DESHPANDE", dl: "MH43 20160007894", pan: "HLDPD7894C", dob: "1990-12-11", validTill: "2036-12-10",
    account: "acct-h15", last4: "7894",
  }, (c) => {
    c.registry.pan = [{ number: "HLDPD7894C", name: "MURALI KRISHNA", dob: "1990-12-11" }];
    withDefect("PAN", "tampered")(c);
  }),

  // D-013: a missing number means "retake" (NUMBER_UNREADABLE, fix); no number means no lookup, never an approval
  build("H16", "bad", "Good licence photo but no number on it", "NEEDS_FIX", ["NUMBER_UNREADABLE"], {
    name: "KISHORE TALWAR", dl: "UP80 20180002360", pan: "HLDPT2360F", dob: "1983-03-19", validTill: "2033-03-18",
    account: "acct-h16", last4: "2360",
  }, (c) => {
    const dl = c.images.DL;
    if (dl) delete dl.printed.number;
  }),
];
