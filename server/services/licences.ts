import type { DriverRow, Store } from "../db/store";
import { daysBetween, istDate } from "../domain/time";
import type { Language } from "../domain/types";
import { rules } from "../policy";

// Licences run out after approval. The policy says when (questions 3 and 9, D-031 and D-032);
// this applies it: a renewal reminder before, and a booking lock after.

// The licence's last valid day, from the latest rules decision that checked it, and when that was.
export function currentLicence(store: Store, driverId: string): { validTill: string; checkedAt: string } | null {
  for (const decision of store.decisions(driverId).reverse()) {
    const check = decision.passed.find((p) => p.check === "DL_VALID");
    if (typeof check?.evidence.validTill === "string") return { validTill: check.evidence.validTill, checkedAt: decision.at };
  }
  return null;
}

export function licenceWindowFor(store: Store, driverId: string, now: Date): { validTill: string; checkedAt: string; due: boolean; expired: boolean } | null {
  const licence = currentLicence(store, driverId);
  return licence ? { ...licence, ...rules.licenceWindow(daysBetween(istDate(now), licence.validTill)) } : null;
}

function longDate(isoDate: string, language: Language): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Question 9: from the day after the licence's last valid day, an approved driver moves to
// LICENCE_EXPIRED, and the bookings lock (which only opens for APPROVED and ACTIVE) does the rest.
export function lapseIfExpired(store: Store, d: DriverRow, now: Date): boolean {
  if (d.status !== "APPROVED" && d.status !== "ACTIVE") return false;
  const licence = licenceWindowFor(store, d.id, now);
  if (!licence?.expired) return false;
  const date = longDate(licence.validTill, d.language);
  const text =
    d.language === "hi"
      ? `आपका ड्राइविंग लाइसेंस ${date} को खत्म हो गया। लोड फिर से बुक करने के लिए नया लाइसेंस अपलोड करें।`
      : `Your driving licence ran out on ${date}. Upload your renewed licence to book loads again.`;
  store.transaction(() => {
    store.move(d.id, "LICENCE_EXPIRED", "system", now, { validTill: licence.validTill });
    store.addChat(d.id, "system", "rules", text, now);
  });
  return true;
}

export function lapseExpiredLicences(store: Store, now: Date): string[] {
  return store.listDrivers().filter((d) => lapseIfExpired(store, d, now)).map((d) => d.id);
}
