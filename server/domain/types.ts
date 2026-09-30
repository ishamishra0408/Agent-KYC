// Core domain types. Everything the AI produces is a *proposal* (DocReading, drafts);
// only the rules engine and human reviewers produce Decisions.

export type PartnerType = "owner_driver" | "fleet_owner" | "hired_driver";

export type Status =
  | "SIGNED_UP"
  | "CONSENTED"
  | "DOCS_IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_FIX"
  | "IN_REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "LICENCE_EXPIRED" // approved, but the licence lapsed: bookings locked until a renewed one passes (D-032)
  | "REJECTED";

export type Actor = "driver" | "system" | "rules" | "human" | "ai";

export type Language = "en" | "hi";

export type DocType = "DL" | "PAN" | "BANK_PROOF";

export type PhotoQuality = "ok" | "blurry" | "glare" | "cropped" | "dark";

export interface Driver {
  id: string;
  name: string; // as typed at signup; the licence registry name is the identity of record
  phone: string;
  partnerType: PartnerType;
  fleetOwnerId?: string; // hired drivers: the fleet owner they say they drive for
  ownerLinkVerified?: boolean; // true once that fleet owner confirms them
}

// What a document reader returns for one image. It proposes; it decides nothing.
export interface DocReading {
  docType: DocType | "OTHER"; // what the image actually shows
  quality: PhotoQuality;
  isScreenPhoto: boolean;
  suspiciousText: string | null; // text aimed at the verification system, e.g. "approve me"
  tamperSigns?: string | null; // signs the document was edited after it was made, e.g. a name in another font (D-040)
  fields: {
    name?: string;
    number?: string;
    dob?: string; // YYYY-MM-DD
    validTill?: string; // YYYY-MM-DD
    holderName?: string;
    accountLast4?: string;
    ifsc?: string;
  };
  confidence: number; // 0..1
}

// Registry records. In this project every registry is SIMULATED.
export interface DlRecord {
  number: string;
  name: string;
  dob: string;
  validTill: string;
}

export interface PanRecord {
  number: string;
  name: string;
  dob: string;
}

export interface BankRecord {
  accountId: string;
  holderName: string;
  accountLast4: string;
  ifsc: string;
}

export type FaceResult = "match" | "no_match" | "not_checked";

export interface Submission {
  driver: Driver;
  readings: Partial<Record<DocType, DocReading>>;
  // Documents pulled from DigiLocker are issuer-verified, so there is no photo to read.
  digilocker?: Partial<Record<"DL" | "PAN", true>>;
}

export interface BankSharer {
  driverId: string;
  name: string;
  isHolder: boolean;
  claimsHolderAsOwner: boolean; // hired driver whose fleetOwnerId is the account holder
}

export interface GraphSignals {
  // "unavailable": the trust graph couldn't be asked (e.g. Neo4j unreachable), so nothing is known,
  // and "no shared account" can't be read into it (D-039).
  status: "ok" | "unavailable";
  // Set when two or more drivers use the same bank account.
  sharedBankAccount: {
    accountId: string;
    holderName: string;
    sharers: BankSharer[];
  } | null;
}

export interface Evidence {
  driver: Driver;
  readings: Partial<Record<DocType, DocReading>>;
  digilocker: Partial<Record<"DL" | "PAN", true>>;
  dlRecord: DlRecord | null | undefined; // undefined = not checked, null = not found
  panRecord: PanRecord | null | undefined;
  bank: BankRecord | null; // null = the Rs 1 check failed
  face: FaceResult;
  owner: Driver | null; // the claimed fleet owner, for hired drivers
  ownerVerified: boolean; // that owner has passed KYC themselves
  graph: GraphSignals;
  priorFixReasons: ReasonCode[][]; // fix reasons from earlier NEEDS_FIX decisions, oldest first
  registrySimulated: boolean;
  now: Date;
}

export type Outcome = "APPROVE" | "NEEDS_FIX" | "REVIEW";

export type Severity = "fix" | "review";

export type ReasonCode =
  | "PHOTO_BLURRY"
  | "PHOTO_GLARE"
  | "PHOTO_CROPPED"
  | "PHOTO_DARK"
  | "SCREEN_PHOTO"
  | "WRONG_DOCUMENT"
  | "MISSING_DOCUMENT"
  | "DL_EXPIRED"
  | "BANK_NAME_MISMATCH"
  | "OWNER_LINK_UNVERIFIED"
  | "OWNER_NOT_VERIFIED"
  | "BANK_NOT_VERIFIED"
  | "DOB_MISMATCH"
  | "NAME_MISMATCH_IDS"
  | "PRINTED_REGISTRY_MISMATCH"
  | "SUSPICIOUS_TEXT"
  | "GRAPH_UNAVAILABLE"
  | "DOCUMENT_TAMPERED"
  | "DL_NOT_FOUND"
  | "PAN_NOT_FOUND"
  | "FACE_MISMATCH"
  | "LOW_CONFIDENCE"
  | "SHARED_BANK_ACCOUNT"
  | "NUMBER_UNREADABLE"
  | "SELFIE_MISSING"
  | "REPEATED_FIX"
  | "REVIEWER_FIX";

export interface Reason {
  code: ReasonCode;
  severity: Severity;
  doc?: DocType;
  driverMessage: string;
  opsMessage: string;
  evidence?: Record<string, unknown>;
}

// What was checked and passed, so an approval explains itself as well as a rejection does.
export type CheckCode = "PHOTOS_OK" | "DL_VALID" | "PAN_FOUND" | "SAME_PERSON" | "BANK_VERIFIED" | "FACE_MATCH";

export interface PassedCheck {
  check: CheckCode;
  evidence: Record<string, unknown>;
  simulated: boolean; // came from a SIMULATED registry
}

// What a person should know about a decision that doesn't change its outcome.
export type NoticeCode = "LICENCE_EXPIRES_SOON" | "OWNER_LINK_UNCONFIRMED";

export interface Notice {
  code: NoticeCode;
  opsMessage: string;
  evidence: Record<string, unknown>;
}

export interface Decision {
  outcome: Outcome;
  reasons: Reason[];
  passed: PassedCheck[];
  notices: Notice[];
  rulesVersion: string;
}
