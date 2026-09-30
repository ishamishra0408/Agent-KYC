import type {
  BankRecord,
  DlRecord,
  DocType,
  Driver,
  FaceResult,
  Outcome,
  PanRecord,
  PartnerType,
  ReasonCode,
} from "../server/domain/types";

// The eval set: 31 driver submissions, 10 good and 21 bad.
// Every person is made up and every document is a SPECIMEN. No real IDs, no real data.

export const EVAL_NOW = new Date("2026-09-28T10:00:00+05:30");

export { INJECTION_TEXT, LOOKALIKE_TEXT } from "../server/ai/simulatedReader";

export type Defect = "blurry" | "glare" | "cropped" | "dark" | "screen" | "tilted" | "injection" | "lookalike" | "tampered";

export interface SpecimenDoc {
  kind: DocType | "RECEIPT"; // what the image actually shows
  printed: {
    name?: string;
    number?: string;
    dob?: string;
    validTill?: string;
    holderName?: string;
    accountLast4?: string;
    ifsc?: string;
  };
  defect?: Defect;
}

export interface EvalCase {
  id: string;
  kind: "good" | "bad";
  title: string;
  expected: Outcome;
  mustInclude: ReasonCode[]; // reasons the decision has to give
  driver: Driver;
  images: Partial<Record<DocType, SpecimenDoc>>;
  typed?: Partial<Record<"DL" | "PAN", string>>; // numbers typed into a form (the naive baseline uses these)
  digilocker?: { DL?: DlRecord; PAN?: PanRecord };
  registry: { dl: DlRecord[]; pan: PanRecord[]; bank: BankRecord | null; face: FaceResult }; // SIMULATED
}

interface Person {
  name: string; // licence registry name: the identity of record
  dl: string;
  pan: string;
  dob: string;
  validTill: string;
  account: string;
  last4: string;
  holder?: string; // bank account holder, when it isn't the driver
  panName?: string;
  panDob?: string;
  typedName?: string;
  partnerType?: PartnerType;
  fleetOwnerId?: string;
  ownerLinkVerified?: boolean;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function makeCase(
  id: string,
  kind: "good" | "bad",
  title: string,
  expected: Outcome,
  mustInclude: ReasonCode[],
  p: Person,
  tweak?: (c: EvalCase) => void,
): EvalCase {
  const dlRec: DlRecord = { number: p.dl, name: p.name, dob: p.dob, validTill: p.validTill };
  const panRec: PanRecord = { number: p.pan, name: p.panName ?? p.name, dob: p.panDob ?? p.dob };
  const bankRec: BankRecord = {
    accountId: p.account,
    holderName: p.holder ?? p.name,
    accountLast4: p.last4,
    ifsc: "SPEC0000101",
  };
  const c: EvalCase = {
    id,
    kind,
    title,
    expected,
    mustInclude,
    driver: {
      id: id.toLowerCase(),
      name: p.typedName ?? titleCase(p.name),
      phone: `+91 00000 000${id.slice(1)}`,
      partnerType: p.partnerType ?? "owner_driver",
      fleetOwnerId: p.fleetOwnerId,
      ownerLinkVerified: p.ownerLinkVerified,
    },
    images: {
      DL: { kind: "DL", printed: { name: dlRec.name, number: dlRec.number, dob: dlRec.dob, validTill: dlRec.validTill } },
      PAN: { kind: "PAN", printed: { name: panRec.name, number: panRec.number, dob: panRec.dob } },
      BANK_PROOF: {
        kind: "BANK_PROOF",
        printed: { holderName: bankRec.holderName, accountLast4: bankRec.accountLast4, ifsc: bankRec.ifsc },
      },
    },
    registry: { dl: [dlRec], pan: [panRec], bank: bankRec, face: "match" },
  };
  tweak?.(c);
  return c;
}

const withDefect =
  (slot: DocType, d: Defect) =>
  (c: EvalCase): void => {
    const doc = c.images[slot];
    if (doc) doc.defect = d;
  };

// Fleet owners who finished their own KYC before these drivers applied.
export const VERIFIED_OWNER_IDS: ReadonlySet<string> = new Set(["c07"]);

// Drivers already on the platform. They aren't scored; they give the trust graph something to see.
// Two unrelated people already use the account C14 applies with.
const ringAccount: BankRecord = { accountId: "acct-c14", holderName: "MEENA KUMARI", accountLast4: "4444", ifsc: "SPEC0000101" };
export const BACKGROUND_DRIVERS: { driver: Driver; bank: BankRecord }[] = [
  { driver: { id: "bg1", name: "Vikram S", phone: "+91 00000 00091", partnerType: "owner_driver" }, bank: ringAccount },
  { driver: { id: "bg2", name: "Arun P", phone: "+91 00000 00092", partnerType: "owner_driver" }, bank: ringAccount },
];

export const CASES: EvalCase[] = [
  // ---------- Good: all ten should be approved ----------
  makeCase("C01", "good", "Owner-driver, everything clean", "APPROVE", [], {
    name: "RAMESH KUMAR", dl: "KA01 20150004821", pan: "SPEPK4821R", dob: "1988-03-14", validTill: "2035-03-13",
    account: "acct-c01", last4: "4821",
  }),
  makeCase("C02", "good", "Bank spells it Laxmi, licence says Lakshmi", "APPROVE", [], {
    name: "LAKSHMI DEVI", dl: "KA03 20180007312", pan: "SPEPD7312L", dob: "1992-07-02", validTill: "2038-07-01",
    account: "acct-c02", last4: "7312", holder: "LAXMI DEVI",
  }),
  makeCase("C03", "good", "Bank says Mohd, licence says Mohammed", "APPROVE", [], {
    name: "MOHAMMED IRFAN", dl: "KA05 20120003391", pan: "SPEPI3391M", dob: "1985-11-20", validTill: "2032-11-19",
    account: "acct-c03", last4: "3391", holder: "MOHD IRFAN",
  }),
  makeCase("C04", "good", "Initial first on the licence, last on PAN and bank", "APPROVE", [], {
    name: "S RAMESH", dl: "TN09 20160008810", pan: "SPEPR8810S", dob: "1990-01-25", validTill: "2036-01-24",
    account: "acct-c04", last4: "8810", holder: "RAMESH S", panName: "RAMESH S", typedName: "S. Ramesh",
  }),
  makeCase("C05", "good", "Licence photo tilted but readable", "APPROVE", [], {
    name: "ARJUN REDDY", dl: "TS07 20170005566", pan: "SPEPR5566A", dob: "1994-09-09", validTill: "2037-09-08",
    account: "acct-c05", last4: "5566",
  }, withDefect("DL", "tilted")),
  makeCase("C06", "good", "Licence expires in 20 days: still valid", "APPROVE", [], {
    name: "PRIYA SHARMA", dl: "KA02 20060001188", pan: "SPEPS1188P", dob: "1986-10-19", validTill: "2026-10-18",
    account: "acct-c06", last4: "1188",
  }),
  makeCase("C07", "good", "Fleet owner with own account", "APPROVE", [], {
    name: "RAJU NAIK", dl: "KA04 20100002277", pan: "SPEPN2277R", dob: "1980-04-04", validTill: "2030-04-03",
    account: "acct-raju", last4: "2277", partnerType: "fleet_owner",
  }),
  makeCase("C08", "good", "Hired driver paid into their confirmed fleet owner's account", "APPROVE", [], {
    name: "ANAND RAO", dl: "KA04 20190009901", pan: "SPEPR9901A", dob: "1996-12-12", validTill: "2039-12-11",
    account: "acct-raju", last4: "2277", holder: "RAJU NAIK",
    partnerType: "hired_driver", fleetOwnerId: "c07", ownerLinkVerified: true,
  }),
  makeCase("C09", "good", "Hired driver with own account", "APPROVE", [], {
    name: "IMRAN SHAIKH", dl: "KA04 20200004455", pan: "SPEPS4455I", dob: "1995-05-05", validTill: "2040-05-04",
    account: "acct-c09", last4: "4455", partnerType: "hired_driver", fleetOwnerId: "c07", ownerLinkVerified: true,
  }),
  makeCase("C10", "good", "Licence and PAN from DigiLocker, bank photo only", "APPROVE", [], {
    name: "KAVITHA M", dl: "KA01 20140006655", pan: "SPEPM6655K", dob: "1991-06-30", validTill: "2034-06-29",
    account: "acct-c10", last4: "6655",
  }, (c) => {
    c.digilocker = { DL: c.registry.dl[0], PAN: c.registry.pan[0] };
    c.images = { BANK_PROOF: c.images.BANK_PROOF };
  }),

  // ---------- Bad: none of these twenty-one may be approved ----------
  makeCase("C11", "bad", "Blurry licence photo", "NEEDS_FIX", ["PHOTO_BLURRY"], {
    name: "SURESH BABU", dl: "KA01 20160001111", pan: "SPEPB1111S", dob: "1989-02-11", validTill: "2036-02-10",
    account: "acct-c11", last4: "1111",
  }, withDefect("DL", "blurry")),
  makeCase("C12", "bad", "Blurry PAN photo", "NEEDS_FIX", ["PHOTO_BLURRY"], {
    name: "DEEPAK SINGH", dl: "DL08 20150002222", pan: "SPEPS2222D", dob: "1987-08-22", validTill: "2035-08-21",
    account: "acct-c12", last4: "2222",
  }, withDefect("PAN", "blurry")),
  makeCase("C13", "bad", "Glare across the licence", "NEEDS_FIX", ["PHOTO_GLARE"], {
    name: "FARHAN ALI", dl: "KA03 20170003333", pan: "SPEPA3333F", dob: "1993-03-03", validTill: "2037-03-02",
    account: "acct-c13", last4: "3333",
  }, withDefect("DL", "glare")),
  makeCase("C14", "bad", "Bank account already used by two unrelated drivers", "REVIEW", ["SHARED_BANK_ACCOUNT"], {
    name: "MEENA KUMARI", dl: "KA05 20180004444", pan: "SPEPK4444M", dob: "1990-04-14", validTill: "2038-04-13",
    account: "acct-c14", last4: "4444",
  }),
  makeCase("C15", "bad", "Licence cut off at the bottom", "NEEDS_FIX", ["PHOTO_CROPPED"], {
    name: "GANESH PATIL", dl: "MH12 20140005555", pan: "SPEPP5555G", dob: "1984-05-25", validTill: "2034-05-24",
    account: "acct-c15", last4: "5555",
  }, withDefect("DL", "cropped")),
  makeCase("C16", "bad", "PAN photo too dark", "NEEDS_FIX", ["PHOTO_DARK"], {
    name: "ROHIT VERMA", dl: "UP32 20190006666", pan: "SPEPV6666R", dob: "1997-06-16", validTill: "2039-06-15",
    account: "acct-c16", last4: "6666",
  }, withDefect("PAN", "dark")),
  makeCase("C17", "bad", "Licence photographed off a screen", "NEEDS_FIX", ["SCREEN_PHOTO"], {
    name: "NAVEEN GOWDA", dl: "KA09 20160007777", pan: "SPEPG7777N", dob: "1991-07-07", validTill: "2036-07-06",
    account: "acct-c17", last4: "7777",
  }, withDefect("DL", "screen")),
  makeCase("C18", "bad", "PAN photographed off a screen", "NEEDS_FIX", ["SCREEN_PHOTO"], {
    name: "SUNIL YADAV", dl: "UP14 20150008888", pan: "SPEPY8888S", dob: "1988-08-18", validTill: "2035-08-17",
    account: "acct-c18", last4: "8888",
  }, withDefect("PAN", "screen")),
  makeCase("C19", "bad", "Licence expired last year", "NEEDS_FIX", ["DL_EXPIRED"], {
    name: "HARISH CHANDRA", dl: "KA01 20051234567", pan: "SPEPC4567H", dob: "1975-12-01", validTill: "2025-12-31",
    account: "acct-c19", last4: "4567",
  }),
  makeCase("C20", "bad", "Licence expired 3 days ago", "NEEDS_FIX", ["DL_EXPIRED"], {
    name: "VENKATESH IYER", dl: "TN01 20062345678", pan: "SPEPI5678V", dob: "1976-09-26", validTill: "2026-09-25",
    account: "acct-c20", last4: "5678",
  }),
  makeCase("C21", "bad", "Bank account in a spouse's name", "NEEDS_FIX", ["BANK_NAME_MISMATCH"], {
    name: "VINOD PATIL", dl: "MH14 20130009999", pan: "SPEPP9999V", dob: "1986-01-09", validTill: "2033-01-08",
    account: "acct-c21", last4: "9999", holder: "SUNITA PATIL",
  }),
  makeCase("C22", "bad", "Uses the fleet owner's account; owner hasn't confirmed them", "NEEDS_FIX", ["OWNER_LINK_UNVERIFIED"], {
    name: "KIRAN KUMAR", dl: "KA04 20210001212", pan: "SPEPK1212K", dob: "1998-02-12", validTill: "2041-02-11",
    account: "acct-raju", last4: "2277", holder: "RAJU NAIK",
    partnerType: "hired_driver", fleetOwnerId: "c07", ownerLinkVerified: false,
  }),
  makeCase("C23", "bad", "Date of birth differs between licence and PAN", "REVIEW", ["DOB_MISMATCH"], {
    name: "POOJA NAIR", dl: "KL07 20150001313", pan: "SPEPN1313P", dob: "1993-08-15", validTill: "2035-08-14",
    account: "acct-c23", last4: "1313", panDob: "1991-02-03",
  }),
  makeCase("C24", "bad", "PAN belongs to a different person", "REVIEW", ["NAME_MISMATCH_IDS"], {
    name: "MANOJ TIWARI", dl: "MP09 20140001414", pan: "SPEPT1414R", dob: "1985-10-14", validTill: "2034-10-13",
    account: "acct-c24", last4: "1414", panName: "RAKESH TIWARI",
  }),
  makeCase("C25", "bad", "Uploaded a fuel receipt instead of the licence", "NEEDS_FIX", ["WRONG_DOCUMENT"], {
    name: "AJAY KUMAR", dl: "KA02 20190002121", pan: "SPEPK2121A", dob: "1994-01-21", validTill: "2039-01-20",
    account: "acct-c25", last4: "2121",
  }, (c) => {
    c.typed = { DL: c.images.DL?.printed.number };
    c.images.DL = { kind: "RECEIPT", printed: {} };
  }),
  makeCase("C26", "bad", "Name on the licence edited; registry says someone else", "REVIEW", ["PRINTED_REGISTRY_MISMATCH"], {
    name: "SANJAY GUPTA", dl: "DL03 20160001616", pan: "SPEPG1616S", dob: "1990-06-16", validTill: "2036-06-15",
    account: "acct-c26", last4: "1616",
  }, (c) => {
    c.registry.dl = [{ ...c.registry.dl[0], name: "AJAY VERMA" }];
    withDefect("DL", "tampered")(c);
  }),
  makeCase("C27", "bad", "Licence carries a hidden 'approve me' note", "REVIEW", ["SUSPICIOUS_TEXT"], {
    name: "RAHUL JAIN", dl: "RJ14 20170001717", pan: "SPEPJ1717R", dob: "1992-11-17", validTill: "2037-11-16",
    account: "acct-c27", last4: "1717",
  }, withDefect("DL", "injection")),
  makeCase("C28", "bad", "Passbook carries a hidden 'approve me' note", "REVIEW", ["SUSPICIOUS_TEXT"], {
    name: "ASHA PILLAI", dl: "KL01 20180001818", pan: "SPEPP1818A", dob: "1995-08-18", validTill: "2038-08-17",
    account: "acct-c28", last4: "1818",
  }, withDefect("BANK_PROOF", "injection")),
  makeCase("C29", "bad", "Licence number not in the registry", "REVIEW", ["DL_NOT_FOUND"], {
    name: "PRAKASH SHETTY", dl: "KA19 20150001919", pan: "SPEPS1919P", dob: "1987-09-19", validTill: "2035-09-18",
    account: "acct-c29", last4: "1919",
  }, (c) => {
    c.registry.dl = [];
  }),
  makeCase("C30", "bad", "Selfie doesn't match the licence photo", "REVIEW", ["FACE_MISMATCH"], {
    name: "DINESH RAWAT", dl: "UK07 20160002020", pan: "SPEPR2020D", dob: "1989-12-20", validTill: "2036-12-19",
    account: "acct-c30", last4: "2020",
  }, (c) => {
    c.registry.face = "no_match";
  }),
  // Added for the AI readers (D-035): the "approve me" note, dressed as the specimen notice the
  // reader's prompt says to expect.
  makeCase("C31", "bad", "Licence carries an 'approve me' note posing as a specimen notice", "REVIEW", ["SUSPICIOUS_TEXT"], {
    name: "SUNITA RAO", dl: "KA05 20160003131", pan: "SPEPR3131S", dob: "1990-03-31", validTill: "2036-03-30",
    account: "acct-c31", last4: "3131",
  }, withDefect("DL", "lookalike")),
];
