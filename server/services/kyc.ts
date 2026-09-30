import { agentSay, FAQ, type AgentEvent, type FaqId, type KycStep, type Lang } from "../ai/scriptedAgent";
import type { GraphFactory } from "../adapters/graph";
import { type PhotoReader, simulatedPhotoReader } from "../adapters/photoReader";
import type { DriverRow, Language, Store } from "../db/store";
import { LOADS } from "../demo/loads";
import type { ShotVariant } from "../demo/shots";
import type { DemoWorld } from "../demo/world";
import { canBook } from "../domain/bookings";
import type { Clock } from "../domain/clock";
import { REASONS } from "../domain/reasons";
import type { Decision, DocType, Driver, Reason, ReasonCode, Status, Submission } from "../domain/types";
import { photoIssue } from "../policy";
import { verifySubmission } from "../verify";
import { lapseIfExpired } from "./licences";
import { greetingName } from "./nudges";
import { applyRulesDecision, humanDecision, tryBook, type BookingResult, type FixStep, type HumanChoice } from "./onboarding";

// What a driver does in the app, wired to the real rules, status machine and store.
// Simulated here: the camera (SPECIMEN photos), the registries, and the assistant's words.

export interface KycContext {
  store: Store;
  clock: Clock;
  world: DemoWorld;
  reader?: PhotoReader; // who reads a photo; the simulated stand-in when absent (D-038)
  graph?: GraphFactory; // the trust graph; in memory when absent, Neo4j when configured (D-039)
  graphName?: string; // shown with the trust graph in the ops console, e.g. "Neo4j"
  log?: (message: string) => void; // failures worth a look, e.g. a photo no model could read; console.warn when absent
}

export class KycError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 409,
  ) {
    super(message);
  }
}

export const ASSISTANT = "assistant (scripted)";
const COLLECTING: ReadonlySet<Status> = new Set<Status>(["DOCS_IN_PROGRESS", "NEEDS_FIX", "LICENCE_EXPIRED"]);
const SLOTS: DocType[] = ["DL", "PAN", "BANK_PROOF"];

const SLOT_LABEL: Record<DocType, Record<Lang, string>> = {
  DL: { en: "licence", hi: "लाइसेंस" },
  PAN: { en: "PAN card", hi: "PAN कार्ड" },
  BANK_PROOF: { en: "passbook", hi: "पासबुक" },
};

const DRIVER_LINES = {
  agree: { en: "I agree", hi: "मैं सहमत हूँ" },
  photo: { en: (s: string) => `Sent a photo of my ${s}`, hi: (s: string) => `${s} की फोटो भेजी` },
  digilocker: { en: "Fetched it from DigiLocker", hi: "DigiLocker से लाया" },
  bank: { en: "Paid Rs 1 from my UPI app", hi: "UPI से ₹1 भेजा" },
  selfie: { en: "Took a selfie", hi: "सेल्फ़ी ली" },
  submit: { en: "Submitted", hi: "सबमिट किया" },
};

const PHOTO_UNREAD = { en: "We couldn't check that photo just now. Please try again.", hi: "हम अभी यह फोटो जाँच नहीं पाए। कृपया फिर से कोशिश करें।" };

function now(ctx: KycContext): Date {
  return ctx.clock.now();
}

function say(ctx: KycContext, id: string, event: AgentEvent): void {
  const d = ctx.store.mustGet(id);
  for (const line of agentSay(event, d.language)) ctx.store.addChat(id, "assistant", ASSISTANT, line, now(ctx));
}

function driverSays(ctx: KycContext, id: string, text: string): void {
  ctx.store.addChat(id, "driver", "driver", text, now(ctx));
}

// Which step a fix request sends the driver back to. Some fixes happen outside the app.
function stepForFix(r: Reason): KycStep | null {
  if (r.code === "REVIEWER_FIX") {
    const step = r.evidence?.step;
    return step === "DL" || step === "PAN" || step === "BANK" || step === "SELFIE" ? step : null;
  }
  if (r.code === "SELFIE_MISSING") return "SELFIE";
  if (r.code === "BANK_NOT_VERIFIED") return "BANK";
  if (r.code === "BANK_NAME_MISMATCH" || r.code === "OWNER_LINK_UNVERIFIED" || r.code === "OWNER_NOT_VERIFIED") return null;
  if (r.doc === "DL" || r.doc === "PAN") return r.doc;
  return null;
}

export function nextStep(store: Store, d: DriverRow): KycStep | null {
  if (d.status === "SIGNED_UP") return "CONSENT";
  if (!COLLECTING.has(d.status)) return null;
  // A lapsed licence: only the renewed licence is needed, then a resubmission (question 9).
  if (d.status === "LICENCE_EXPIRED") {
    const lapsedAt = store.events(d.id).filter((e) => e.type === "status_changed" && e.toStatus === "LICENCE_EXPIRED").at(-1)?.at ?? "";
    const dl = store.currentDocuments(d.id).DL;
    return dl && !dl.issue && dl.at >= lapsedAt ? "SUBMIT" : "DL"; // uploaded at or after the lapse
  }
  if (d.status === "NEEDS_FIX") {
    const fix = store.latestDecision(d.id)?.reasons.find((r) => r.severity === "fix");
    // A fix made outside the app (another account, the owner confirming) ends in submitting again.
    // Asked for the same fix twice already, the rules hand the case to a person (D-016).
    return fix ? (stepForFix(fix) ?? "SUBMIT") : "DL";
  }
  const docs = store.currentDocuments(d.id);
  if (!docs.DL || docs.DL.issue) return "DL";
  if (!docs.PAN || docs.PAN.issue) return "PAN";
  if (!store.hasStep(d.id, "bank_check")) return "BANK";
  if (!store.hasStep(d.id, "selfie")) return "SELFIE";
  return "SUBMIT";
}

function promptNext(ctx: KycContext, id: string): void {
  const step = nextStep(ctx.store, ctx.store.mustGet(id));
  if (step) say(ctx, id, { type: "prompt", step });
}

function collecting(ctx: KycContext, id: string): DriverRow {
  const d = ctx.store.mustGet(id);
  if (!COLLECTING.has(d.status)) throw new KycError("Documents can't be changed right now.");
  return d;
}

// Fixing something reopens document collection.
function reopenIfFixing(ctx: KycContext, d: DriverRow): void {
  if (d.status === "NEEDS_FIX") ctx.store.move(d.id, "DOCS_IN_PROGRESS", "driver", now(ctx));
}

export function signUp(ctx: KycContext, driver: Driver, language: Language = "en"): DriverRow {
  const d = ctx.store.addDriver(driver, now(ctx), language);
  say(ctx, d.id, { type: "welcome", name: greetingName(d.name) });
  return d;
}

export function consent(ctx: KycContext, id: string): void {
  const d = ctx.store.mustGet(id);
  if (d.status !== "SIGNED_UP") throw new KycError("Consent was already given.");
  ctx.store.transaction(() => {
    ctx.store.move(id, "CONSENTED", "driver", now(ctx));
    ctx.store.move(id, "DOCS_IN_PROGRESS", "driver", now(ctx));
  });
  driverSays(ctx, id, DRIVER_LINES.agree[d.language]);
  promptNext(ctx, id);
}

export async function takePhoto(ctx: KycContext, id: string, slot: DocType, variant: ShotVariant): Promise<{ issue: ReasonCode | null }> {
  const { language } = collecting(ctx, id);
  const shot = ctx.world.shot(id, slot, variant);
  if (!shot) throw new KycError("No sample photo for that document.", 404);
  let read;
  try {
    read = await (ctx.reader ?? simulatedPhotoReader).read({ shotId: shot.id, doc: shot.doc });
  } catch (err) {
    // A photo nobody could read stores nothing, and is never taken as a good one (D-038). The
    // reader's errors never carry the API key (openrouter.ts).
    (ctx.log ?? console.warn)(`Photo ${shot.id} for ${id} wasn't read: ${err instanceof Error ? err.message : String(err)}`);
    throw new KycError(PHOTO_UNREAD[language], 503);
  }
  const d = collecting(ctx, id); // again: the driver may have moved on while the photo was read
  const issue = photoIssue(read.reading, slot);
  ctx.store.transaction(() => {
    reopenIfFixing(ctx, d);
    ctx.store.addDocument({
      driverId: id,
      at: now(ctx).toISOString(),
      slot,
      source: "photo",
      shotId: shot.id,
      reading: read.reading,
      issue,
      readBy: read.readBy,
      fallbackReason: read.fallbackReason,
    });
  });
  driverSays(ctx, id, DRIVER_LINES.photo[d.language](SLOT_LABEL[slot][d.language]));
  say(ctx, id, { type: "photo", slot, issue });
  if (!issue) promptNext(ctx, id);
  return { issue };
}

export function useDigilocker(ctx: KycContext, id: string, slot: "DL" | "PAN"): void {
  const d = collecting(ctx, id);
  if (slot === "DL") ctx.world.renewLapsedLicence(id, now(ctx)); // SIMULATED: renewed at the RTO
  ctx.store.transaction(() => {
    reopenIfFixing(ctx, d);
    ctx.store.addDocument({ driverId: id, at: now(ctx).toISOString(), slot, source: "digilocker", shotId: null, reading: null, issue: null });
  });
  driverSays(ctx, id, DRIVER_LINES.digilocker[d.language]);
  say(ctx, id, { type: "digilocker" });
  promptNext(ctx, id);
}

export function bankCheck(ctx: KycContext, id: string): void {
  const d = collecting(ctx, id);
  ctx.store.transaction(() => {
    reopenIfFixing(ctx, d);
    ctx.store.markStep(id, "bank_check", now(ctx));
  });
  driverSays(ctx, id, DRIVER_LINES.bank[d.language]);
  say(ctx, id, { type: "bank_checked" });
  promptNext(ctx, id);
}

export function takeSelfie(ctx: KycContext, id: string): void {
  const d = collecting(ctx, id);
  ctx.store.transaction(() => {
    reopenIfFixing(ctx, d);
    ctx.store.markStep(id, "selfie", now(ctx));
  });
  driverSays(ctx, id, DRIVER_LINES.selfie[d.language]);
  say(ctx, id, { type: "selfie_taken" });
  promptNext(ctx, id);
}

// What the driver would submit right now: the latest photo per slot, or a DigiLocker fetch.
export function submissionFor(store: Store, id: string): Submission {
  const driver = store.mustGet(id);
  const docs = store.currentDocuments(id);
  const readings: Submission["readings"] = {};
  const digilocker: Submission["digilocker"] = {};
  for (const slot of SLOTS) {
    const doc = docs[slot];
    if (!doc) continue;
    if (doc.source === "digilocker" && slot !== "BANK_PROOF") digilocker[slot] = true;
    else if (doc.reading) readings[slot] = doc.reading;
  }
  return { driver, readings, digilocker };
}

export async function submit(ctx: KycContext, id: string): Promise<Decision> {
  const d = ctx.store.mustGet(id);
  if (!COLLECTING.has(d.status)) throw new KycError("There's nothing to submit right now.");

  // Check first, change state second: if a registry lookup fails, the driver isn't left stuck in SUBMITTED.
  const decision = await verifySubmission(submissionFor(ctx.store, id), ctx.world.verifyDeps(ctx.store, ctx.clock, ctx.graph));
  ctx.store.transaction(() => {
    ctx.store.move(id, "SUBMITTED", "driver", now(ctx));
    applyRulesDecision(ctx.store, id, decision, now(ctx));
  });
  driverSays(ctx, id, DRIVER_LINES.submit[d.language]);

  const fixes = decision.reasons.filter((r) => r.severity === "fix").map((r) => r.code);
  for (const line of agentSay({ type: "decision", outcome: decision.outcome, fixes }, d.language)) {
    ctx.store.addChat(id, "system", "rules", line, now(ctx));
  }
  return decision;
}

export function ask(ctx: KycContext, id: string, faq: FaqId): void {
  const d = ctx.store.mustGet(id);
  driverSays(ctx, id, FAQ[faq].q[d.language]);
  say(ctx, id, { type: "faq", id: faq });
}

export function reviewerDecision(ctx: KycContext, id: string, choice: HumanChoice, note: string, step?: FixStep): DriverRow {
  const d = humanDecision(ctx.store, id, choice, note, now(ctx), { step });
  const lang = d.language;
  const text =
    choice === "APPROVE"
      ? agentSay({ type: "decision", outcome: "APPROVE", fixes: [] }, lang)[0]
      : choice === "NEEDS_FIX"
        ? lang === "hi"
          ? `समीक्षक ने यह ठीक करने को कहा है: ${note}`
          : `A reviewer asked you to fix this: ${note}`
        : lang === "hi"
          ? "हम आपका वेरिफ़िकेशन नहीं कर पाए। अगर यह गलती लगे तो सपोर्ट से संपर्क करें।"
          : "We couldn't verify you. Contact support if you think this is a mistake.";
  ctx.store.addChat(id, "system", "reviewer", text, now(ctx));
  return d;
}

// Demo stand-in for the fleet owner confirming a driver in their own app (SIMULATED).
export function ownerConfirms(ctx: KycContext, id: string): DriverRow {
  const d = ctx.store.mustGet(id);
  if (!d.fleetOwnerId) throw new KycError("This driver hasn't named a fleet owner.", 400);
  const confirmed = ctx.store.confirmOwnerLink(id, d.fleetOwnerId, now(ctx));
  const text =
    d.language === "hi"
      ? "आपके फ्लीट मालिक ने आपकी पुष्टि कर दी है। पूरा करने के लिए फिर से सबमिट करें।"
      : "Your fleet owner confirmed you. Submit again to finish.";
  ctx.store.addChat(id, "system", "fleet owner", text, now(ctx));
  return confirmed;
}

export function book(ctx: KycContext, id: string, loadId: string): BookingResult & { firstTrip?: boolean } {
  const d = ctx.store.getDriver(id);
  if (d) lapseIfExpired(ctx.store, d, now(ctx)); // the lock applies from the day after the last valid day
  const r = tryBook(ctx.store, id);
  if (!r.ok) return r;
  if (!LOADS.some((l) => l.id === loadId)) return { ok: false, httpStatus: 404, message: "Load not found." };
  const firstTrip = ctx.store.bookings(id).length === 0;
  ctx.store.addBooking(id, loadId, now(ctx));
  if (ctx.store.mustGet(id).status === "APPROVED") ctx.store.move(id, "ACTIVE", "system", now(ctx), { loadId });
  return firstTrip ? { ok: true, firstTrip: true } : { ok: true };
}

export interface DriverView {
  driver: { id: string; name: string; partnerType: string; status: Status; language: Language; optedOut: boolean };
  nextStep: KycStep | null;
  steps: { bank: boolean; selfie: boolean };
  documents: Partial<Record<DocType, { source: string; shotId: string | null; issue: ReasonCode | null }>>;
  // Review reasons are never shown to the driver: only that a person is checking.
  decision: { outcome: string; by: string; at: string; fixes: { code: ReasonCode; message: string }[] } | null;
  chat: { role: string; author: string; text: string; at: string }[];
  inbox: { at: string; kind: string; text: string | null; deepLink: string | null; writer: string | null }[];
  canBook: boolean;
  bookings: { loadId: string; at: string }[];
}

export function driverView(ctx: KycContext, id: string): DriverView {
  const { store } = ctx;
  const d = store.mustGet(id);
  const docs = store.currentDocuments(id);
  const latest = store.latestDecision(id);
  return {
    driver: { id: d.id, name: d.name, partnerType: d.partnerType, status: d.status, language: d.language, optedOut: d.optedOut },
    nextStep: nextStep(store, d),
    steps: { bank: store.hasStep(id, "bank_check"), selfie: store.hasStep(id, "selfie") },
    documents: Object.fromEntries(
      SLOTS.filter((s) => docs[s]).map((s) => {
        const doc = docs[s];
        return [s, { source: doc?.source ?? "photo", shotId: doc?.shotId ?? null, issue: doc?.issue ?? null }];
      }),
    ),
    decision: latest
      ? {
          outcome: latest.outcome,
          by: latest.actor,
          at: latest.at,
          // Fix reasons only, and only while a fix is actually being asked for.
          fixes:
            d.status === "NEEDS_FIX"
              ? latest.reasons
                  .filter((r) => r.severity === "fix")
                  .map((r) => ({ code: r.code, message: REASONS[r.code].driver[d.language] }))
              : [],
        }
      : null,
    chat: store.chat(id).map((m) => ({ role: m.role, author: m.author, text: m.text, at: m.at })),
    inbox: store
      .nudges(id)
      .filter((n) => n.action !== "hold")
      .reverse()
      .map((n) => ({ at: n.at, kind: n.action, text: n.text, deepLink: n.deepLink, writer: n.writer })),
    canBook: canBook(d.status),
    bookings: store.bookings(id).map((b) => ({ loadId: b.loadId, at: b.at })),
  };
}
