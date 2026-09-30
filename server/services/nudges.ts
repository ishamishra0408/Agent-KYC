import type { NudgeWriter } from "../ai/nudgeWriter";
import type { DriverRow, Store } from "../db/store";
import { blockerFor, deepLinkFor, gateway } from "../domain/nudgeRules";
import type { Language } from "../domain/types";
import { currentLicence, lapseExpiredLicences, licenceWindowFor } from "./licences";

export type { NudgeDraftInput, NudgeWriter } from "../ai/nudgeWriter";

export interface NudgeCycleItem {
  driverId: string;
  action: "send" | "status_update" | "hold" | "skip";
  reason: string;
  text?: string;
  deepLink?: string;
  notBefore?: string;
}

export const STATUS_UPDATE_TEXT: Record<Language, string> = {
  en: "A person is checking your documents. You don't need to do anything. We'll message you when it's done.",
  hi: "आपके दस्तावेज़ जाँचे जा रहे हैं। आपको कुछ करने की ज़रूरत नहीं है। पूरा होते ही हम आपको बताएँगे।",
};

export function greetingName(fullName: string): string {
  return fullName.split(/\s+/).find((t) => t.replace(/\W/g, "").length > 2) ?? fullName;
}

// Question 3 (D-031): one renewal reminder once an approved driver's licence is inside the policy's
// window. Returns the licence's last valid day when a reminder is due.
function renewalDueFor(store: Store, d: DriverRow, now: Date): string | null {
  if (d.status !== "APPROVED" && d.status !== "ACTIVE") return null;
  const licence = licenceWindowFor(store, d.id, now);
  if (!licence?.due) return null;
  // One reminder per licence: reminders sent before this licence was checked were about an older one.
  const reminded = store.nudges(d.id).some((n) => n.blocker === "RENEW_LICENCE" && n.action === "send" && n.at >= licence.checkedAt);
  return reminded ? null : licence.validTill;
}

// One pass over every driver: lock lapsed licences first (question 9), then work out each blocker,
// ask the gateway, and draft only if allowed.
export async function runNudgeCycle(store: Store, writer: NudgeWriter, now: Date): Promise<NudgeCycleItem[]> {
  lapseExpiredLicences(store, now);
  const out: NudgeCycleItem[] = [];
  const at = now.toISOString();

  for (const d of store.listDrivers()) {
    const renewBy = renewalDueFor(store, d, now);
    const blocker = renewBy ? "RENEW_LICENCE" : blockerFor(d.status);
    const g = gateway({
      status: d.status,
      optedOut: d.optedOut,
      lastNudgeAt: store.lastSentNudgeAt(d.id),
      statusUpdateSentForCurrentStatus: store.statusUpdateSent(d.id, d.status),
      renewalDue: renewBy !== null,
      now,
    });

    if (g.action === "skip") {
      out.push({ driverId: d.id, action: "skip", reason: g.reason });
      continue;
    }

    if (g.action === "hold") {
      const notBefore = g.notBefore?.toISOString() ?? null;
      const last = store.lastNudge(d.id);
      const alreadyLogged = last?.action === "hold" && last.reason === g.reason && last.notBefore === notBefore;
      if (!alreadyLogged) {
        store.recordNudge({
          driverId: d.id,
          at,
          forStatus: d.status,
          blocker,
          action: "hold",
          reason: g.reason,
          notBefore,
          text: null,
          writer: null,
          deepLink: null,
        });
      }
      out.push({ driverId: d.id, action: "hold", reason: g.reason, notBefore: notBefore ?? undefined });
      continue;
    }

    const fix = d.status === "NEEDS_FIX" ? store.latestDecision(d.id)?.reasons.find((r) => r.severity === "fix") : undefined;
    const selfie = fix?.code === "SELFIE_MISSING" || fix?.evidence?.step === "SELFIE";
    const fixTarget = fix ? (fix.doc ?? (selfie ? "SELFIE" : undefined)) : undefined;
    const deepLink = deepLinkFor(blocker, fixTarget);
    const text =
      g.action === "status_update"
        ? STATUS_UPDATE_TEXT[d.language]
        : await writer.draft({
            name: greetingName(d.name),
            language: d.language,
            blocker,
            fixReason: fix?.code,
            renewBy: renewBy ?? (blocker === "LICENCE_EXPIRED" ? currentLicence(store, d.id)?.validTill : undefined),
          });

    store.recordNudge({
      driverId: d.id,
      at,
      forStatus: d.status,
      blocker,
      action: g.action,
      reason: g.reason,
      notBefore: null,
      text,
      writer: g.action === "send" ? writer.name : "system",
      deepLink,
    });
    out.push({ driverId: d.id, action: g.action, reason: g.reason, text, deepLink });
  }

  return out;
}
