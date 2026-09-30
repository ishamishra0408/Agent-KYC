import { DONE, WAITING_ON_US } from "./statusMachine";
import { istAt, istParts } from "./time";
import type { DocType, Status } from "./types";

export const NUDGE_MIN_GAP_HOURS = 48; // the old system's 2-day cadence, kept as a ceiling
export const QUIET_START_HOUR = 21; // 9 PM IST
export const QUIET_END_HOUR = 8; // 8 AM IST

// RENEW_LICENCE: an approved driver whose licence is about to run out (question 3, D-031).
export type Blocker = "NOT_STARTED" | "DOCS_PENDING" | "NEEDS_FIX" | "WAITING_ON_US" | "DONE" | "RENEW_LICENCE" | "LICENCE_EXPIRED";

export function blockerFor(status: Status): Blocker {
  if (DONE.has(status)) return "DONE";
  if (WAITING_ON_US.has(status)) return "WAITING_ON_US";
  if (status === "NEEDS_FIX") return "NEEDS_FIX";
  if (status === "LICENCE_EXPIRED") return "LICENCE_EXPIRED";
  if (status === "SIGNED_UP") return "NOT_STARTED";
  return "DOCS_PENDING";
}

// Where tapping a nudge lands: the step the driver is stuck on, not the top of the form.
export function deepLinkFor(blocker: Blocker, fixTarget?: DocType | "SELFIE"): string {
  switch (blocker) {
    case "NOT_STARTED":
      return "/kyc/consent";
    case "DOCS_PENDING":
      return "/kyc/documents";
    case "NEEDS_FIX":
      return fixTarget ? `/kyc/fix/${fixTarget.toLowerCase()}` : "/kyc/documents";
    case "WAITING_ON_US":
      return "/kyc/status";
    case "DONE":
      return "/loads";
    case "RENEW_LICENCE":
    case "LICENCE_EXPIRED":
      return "/kyc/licence";
  }
}

export type GatewayAction = "send" | "status_update" | "hold" | "skip";

export interface GatewayInput {
  status: Status;
  optedOut: boolean;
  lastNudgeAt: Date | null;
  statusUpdateSentForCurrentStatus: boolean;
  renewalDue?: boolean; // an approved driver the policy says should hear about renewing their licence
  now: Date;
}

export interface GatewayResult {
  action: GatewayAction;
  reason: string;
  notBefore?: Date;
}

export function isQuietHours(t: Date): boolean {
  const h = istParts(t).hour;
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

export function nextQuietEnd(t: Date): Date {
  const p = istParts(t);
  return p.hour < QUIET_END_HOUR
    ? istAt(p.y, p.m, p.day, QUIET_END_HOUR)
    : istAt(p.y, p.m, p.day + 1, QUIET_END_HOUR);
}

// The send gateway is plain code. The nudge writer (AI) can draft anything;
// only this function decides what actually goes out, and when.
export function gateway(i: GatewayInput): GatewayResult {
  // Done means no more reminders, except a licence renewal reminder for an approved driver,
  // which follows the same limits. A rejected driver never hears from us again.
  if (DONE.has(i.status) && (!i.renewalDue || i.status === "REJECTED")) return { action: "skip", reason: "done" };
  if (i.optedOut) return { action: "skip", reason: "opted out" };

  if (WAITING_ON_US.has(i.status)) {
    if (i.statusUpdateSentForCurrentStatus) return { action: "skip", reason: "waiting on us: no reminders" };
    if (isQuietHours(i.now)) return { action: "hold", reason: "quiet hours", notBefore: nextQuietEnd(i.now) };
    return { action: "status_update", reason: "waiting on us" };
  }

  if (i.lastNudgeAt) {
    const earliest = new Date(i.lastNudgeAt.getTime() + NUDGE_MIN_GAP_HOURS * 3_600_000);
    if (i.now < earliest) {
      const notBefore = isQuietHours(earliest) ? nextQuietEnd(earliest) : earliest;
      return { action: "hold", reason: "max 1 nudge per 2 days", notBefore };
    }
  }

  if (isQuietHours(i.now)) return { action: "hold", reason: "quiet hours", notBefore: nextQuietEnd(i.now) };
  return { action: "send", reason: "allowed" };
}
