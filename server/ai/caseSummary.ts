import { namesMatch } from "../domain/names";
import type { PassedCheck, Reason } from "../domain/types";

// The summary a reviewer reads first, in one line. A template until an AI summarizer, built only
// from the decision's own reasons, so it can't say anything the evidence doesn't. Null when there's
// nothing to explain: the ticks already say what passed. The ops console shows it in place of each
// reason's own message (D-041).

const DOC: Record<string, string> = { DL: "licence", PAN: "PAN", BANK_PROOF: "bank account" };
const plain = (message: string) => message.replace(/\.$/, "");
const quoted = (text: string) => `"${text}"${/[.!?]$/.test(text) ? "" : "."}`;

function detail(r: Reason): string {
  const e = r.evidence ?? {};
  if (r.code === "SHARED_BANK_ACCOUNT" && Array.isArray(e.sharers)) {
    // Everyone on the account but its holder.
    const holder = typeof e.holder === "string" ? e.holder : "";
    const others = (e.sharers as string[]).filter((name) => !holder || !namesMatch(name, holder).match);
    return `${plain(r.opsMessage)}${holder ? ` (${holder})` : ""}: ${others.join(", ")}.`;
  }
  if (r.code === "PRINTED_REGISTRY_MISMATCH") return `${plain(r.opsMessage)}: printed "${String(e.printed)}", registry "${String(e.registry)}".`;
  if (r.code === "SUSPICIOUS_TEXT") return `${plain(r.opsMessage)}: ${quoted(String(e.text))}`;
  return r.opsMessage;
}

export function caseSummary(d: { reasons: readonly Reason[]; passed: readonly PassedCheck[] }): string | null {
  // The same sentence for two documents is said once, naming both.
  const sentences = new Map<string, string[]>();
  for (const r of d.reasons) {
    const docs = sentences.get(detail(r)) ?? [];
    if (r.doc) docs.push(DOC[r.doc] ?? r.doc);
    sentences.set(detail(r), docs);
  }
  if (sentences.size === 0) return null;
  return [...sentences].map(([text, docs]) => (docs.length > 1 ? `${plain(text)} (${docs.join(" and ")}).` : text)).join(" ");
}
