import { describe, expect, it } from "vitest";
import { reviewDraft } from "../server/ai/reviewDraft";
import type { PassedCheck, Reason } from "../server/domain/types";

// The reviewer's copilot (D-048): drafts come only from the case's evidence, and a note to the
// driver never says why the case went to a person (D-021).
const shared: Reason = {
  code: "SHARED_BANK_ACCOUNT",
  severity: "review",
  driverMessage: "We're checking your details.",
  opsMessage: "Bank account shared with drivers who have no link to its holder.",
  evidence: { holder: "MEENA KUMARI", sharers: ["Meena Kumari", "Vikram S", "Arun P"] },
  doc: "BANK_PROOF",
};
const passed: PassedCheck[] = [
  { check: "PHOTOS_OK", evidence: {}, simulated: false },
  { check: "DL_VALID", evidence: {}, simulated: true },
];
const decision = { reasons: [shared], passed };

describe("reviewDraft", () => {
  it("drafts an internal reason from the case's own reasons and checks", () => {
    const text = reviewDraft(decision, "APPROVE");
    expect(text).toContain("Vikram S, Arun P");
    expect(text).toContain("Passed: photos readable, licence valid.");
    expect(text.endsWith("Approved because")).toBe(true);
    expect(reviewDraft(decision, "REJECT").endsWith("Rejected because")).toBe(true);
  });

  it("never tells the driver why the case went to a person", () => {
    for (const step of ["DL", "PAN", "BANK", "SELFIE"] as const) {
      const note = reviewDraft(decision, "NEEDS_FIX", step);
      expect(note.length).toBeGreaterThan(0);
      for (const leak of ["shared", "Vikram", "Arun", "holder", "review", "person"]) expect(note.toLowerCase()).not.toContain(leak.toLowerCase());
    }
    expect(reviewDraft(decision, "NEEDS_FIX")).toBe("");
  });

  it("fits the note box", () => {
    const many = { reasons: Array.from({ length: 12 }, (_, i) => ({ ...shared, code: `R${i}` as Reason["code"], opsMessage: "x".repeat(60) + i })), passed };
    expect(reviewDraft(many, "APPROVE").length).toBeLessThanOrEqual(500);
  });
});
