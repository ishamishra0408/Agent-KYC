import type { PassedCheck, Reason } from "../domain/types";
import { caseSummary } from "./caseSummary";

// The reviewer's copilot (D-048): a first draft of the note, from the case's own evidence. A template
// until an AI writer, like the summary: it can't say anything the evidence doesn't, and the reviewer
// edits it and makes the decision. A note to the driver never says why the case went to a person
// (D-021): it only asks for the step to redo.
export type DraftChoice = "APPROVE" | "NEEDS_FIX" | "REJECT";
export type DraftStep = "DL" | "PAN" | "BANK" | "SELFIE";

const CHECKED: Record<string, string> = {
  PHOTOS_OK: "photos readable",
  DL_VALID: "licence valid",
  PAN_FOUND: "PAN found",
  SAME_PERSON: "same person",
  BANK_VERIFIED: "bank verified",
  FACE_MATCH: "selfie matches",
};

const REDO: Record<DraftStep, string> = {
  DL: "Please take a new photo of the front of your driving licence: flat, in good light, with all four corners in the frame.",
  PAN: "Please take a new photo of your PAN card: flat, in good light, with all four corners in the frame.",
  BANK: "Please redo the bank check with an account in your own name.",
  SELFIE: "Please take a new selfie: face the camera in good light, with nothing covering your face.",
};

export const DRAFT_WRITER = "template";

export function reviewDraft(d: { reasons: readonly Reason[]; passed: readonly PassedCheck[] }, choice: DraftChoice, step?: DraftStep): string {
  if (choice === "NEEDS_FIX") return step ? REDO[step] : "";
  const why = caseSummary(d);
  const passed = d.passed.map((p) => CHECKED[p.check]).filter(Boolean);
  const lines = [
    why ? `Sent to a person: ${why}` : null,
    passed.length ? `Passed: ${passed.join(", ")}.` : null,
    choice === "APPROVE" ? "Approved because" : "Rejected because",
  ];
  return lines.filter(Boolean).join("\n").slice(0, 480);
}
