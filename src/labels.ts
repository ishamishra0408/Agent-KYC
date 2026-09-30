import type { FixStep, Slot } from "./api";

// Short, plain labels for codes the server sends.

export const REASON_LABEL: Record<string, string> = {
  PHOTO_BLURRY: "Blurry photo",
  PHOTO_GLARE: "Glare",
  PHOTO_CROPPED: "Cut off",
  PHOTO_DARK: "Too dark",
  SCREEN_PHOTO: "Photo of a screen",
  WRONG_DOCUMENT: "Wrong document",
  MISSING_DOCUMENT: "Missing document",
  DL_EXPIRED: "Licence expired",
  BANK_NAME_MISMATCH: "Bank name doesn't match",
  OWNER_LINK_UNVERIFIED: "Owner hasn't confirmed",
  OWNER_NOT_VERIFIED: "Owner hasn't done KYC",
  BANK_NOT_VERIFIED: "Bank not verified",
  DOB_MISMATCH: "Birth dates differ",
  NAME_MISMATCH_IDS: "IDs name different people",
  PRINTED_REGISTRY_MISMATCH: "Card doesn't match registry",
  SUSPICIOUS_TEXT: "Hidden instructions",
  DL_NOT_FOUND: "Licence not in registry",
  PAN_NOT_FOUND: "PAN not in registry",
  FACE_MISMATCH: "Selfie mismatch",
  LOW_CONFIDENCE: "Reader unsure",
  SHARED_BANK_ACCOUNT: "Shared bank account",
  GRAPH_UNAVAILABLE: "Account check unavailable",
  DOCUMENT_TAMPERED: "Looks edited",
  NUMBER_UNREADABLE: "Number unreadable",
  SELFIE_MISSING: "No selfie yet",
  REPEATED_FIX: "Fix asked twice already",
  REVIEWER_FIX: "Reviewer asked for a fix",
};

// Notices don't change an outcome: they're what ops should keep an eye on.
export const NOTICE_LABEL: Record<string, string> = {
  LICENCE_EXPIRES_SOON: "Licence renewal due",
  OWNER_LINK_UNCONFIRMED: "Owner link unverified",
};

export const FIX_STEP_LABEL: Record<FixStep, string> = {
  DL: "Licence photo",
  PAN: "PAN photo",
  BANK: "Bank account (Rs 1 check)",
  SELFIE: "Selfie",
};

// The vehicle decision (D-049).
export const VEHICLE_OUTCOME_LABEL: Record<string, string> = { APPROVE: "Verified", NEEDS_FIX: "Asked to fix" };
export const VEHICLE_REASON_LABEL: Record<string, string> = {
  VEHICLE_NOT_FOUND: "No such registration",
  VEHICLE_NOT_GOODS: "Not a goods vehicle",
  VEHICLE_REGISTRATION_EXPIRED: "Registration expired",
  VEHICLE_OWNER_MISMATCH: "Someone else's vehicle",
  VEHICLE_OWNER_NOT_VERIFIED: "Fleet owner isn't verified",
  VEHICLE_OWNER_LINK_UNVERIFIED: "Fleet owner hasn't confirmed them",
  VEHICLE_NOT_VERIFIED: "Couldn't verify",
};
export const VEHICLE_CHECK_LABEL: Record<string, string> = {
  VEHICLE_FOUND: "Registration found",
  VEHICLE_OWNER: "Owner matches",
  VEHICLE_GOODS: "Goods vehicle",
  VEHICLE_VALID: "Registration valid",
};

export const CHECK_LABEL: Record<string, string> = {
  PHOTOS_OK: "Photos readable",
  DL_VALID: "Licence valid",
  PAN_FOUND: "PAN found",
  SAME_PERSON: "Same person",
  BANK_VERIFIED: "Bank verified",
  FACE_MATCH: "Selfie matches",
};

export const OUTCOME_LABEL: Record<string, string> = {
  APPROVE: "Approve",
  NEEDS_FIX: "Ask for a fix",
  REVIEW: "Send to a person",
  REJECT: "Reject",
};

// The same outcomes once decided.
export const OUTCOME_DONE: Record<string, string> = {
  APPROVE: "Approved",
  NEEDS_FIX: "Asked for a fix",
  REVIEW: "Sent to a person",
  REJECT: "Rejected",
};

export const BLOCKER_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  DOCS_PENDING: "Documents pending",
  NEEDS_FIX: "Needs a fix",
  WAITING_ON_US: "Waiting on us",
  DONE: "Done",
  RENEW_LICENCE: "Licence renewal",
  LICENCE_EXPIRED: "Licence expired",
};

export const SLOT_LABEL: Record<Slot, string> = {
  DL: "Driving licence",
  PAN: "PAN card",
  BANK_PROOF: "Bank account",
};

export const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  number: "Number",
  dob: "Date of birth",
  validTill: "Valid till",
  holderName: "Holder",
  accountLast4: "Account",
  ifsc: "IFSC",
};

// The models that can read a photo in the app (D-038), by the id OpenRouter reports.
export const MODEL_LABEL: Record<string, string> = {
  "google/gemma-4-31b-it": "Gemma 4 31B",
  "anthropic/claude-sonnet-5.5": "Claude Sonnet 5.5",
};

export const READER_LABEL: Record<string, string> = {
  app: "Gemma 4 31B, then Claude Sonnet",
  gemma: "Gemma 4 31B (open-weight)",
  "claude-sonnet": "Claude Sonnet 5.5",
  "claude-opus": "Claude Opus 5.5",
  "claude-haiku": "Claude Haiku 4.5",
  qwen: "Qwen 3.8 27B (open-weight)",
  oracle: "Perfect reading: the answer key",
  heuristic: "Image checks only: blur, glare, brightness",
  naive: "Reads nothing: trusts what the driver typed",
};

// The Tests tab's groups, in order.
export const READER_GROUPS: { title: string; readers: string[] }[] = [
  { title: "Used in the app", readers: ["app"] },
  { title: "AI models compared", readers: ["gemma", "claude-sonnet", "claude-opus", "claude-haiku", "qwen"] },
  { title: "Without AI, for comparison", readers: ["oracle", "heuristic", "naive"] },
];
