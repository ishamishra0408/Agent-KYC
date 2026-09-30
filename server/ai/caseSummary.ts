import type { PassedCheck, Reason } from "../domain/types";

// The summary a reviewer reads first, in one line. A template until an AI summarizer, built only
// from the decision's own reasons and passed checks, so it can't say anything the evidence doesn't.
// The ops console shows it in place of each reason's own message (D-041).

const CORE_CHECKS = 6; // photos, licence, PAN, same person, bank, selfie

const plain = (message: string) => message.replace(/\.$/, "");

function detail(r: Reason): string {
  const e = r.evidence ?? {};
  // Everyone on the account, the holder included: the evidence doesn't say which of them are unlinked.
  if (r.code === "SHARED_BANK_ACCOUNT" && Array.isArray(e.sharers)) return `${r.opsMessage} On the account: ${(e.sharers as string[]).join(", ")}.`;
  if (r.code === "PRINTED_REGISTRY_MISMATCH") return `${plain(r.opsMessage)}: printed "${String(e.printed)}", registry "${String(e.registry)}".`;
  if (r.code === "SUSPICIOUS_TEXT") return `${plain(r.opsMessage)}: "${String(e.text)}".`;
  return r.opsMessage;
}

export function caseSummary(d: { reasons: readonly Reason[]; passed: readonly PassedCheck[] }): string {
  return [...d.reasons.map(detail), `${d.passed.length} of ${CORE_CHECKS} checks passed.`].join(" ");
}
