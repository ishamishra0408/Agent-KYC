import { Camera, CheckCircle2, FolderDown, IndianRupee, Send, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type DriverView, type Faq, type Lang, type Slot, type Step, type Variant } from "../api";
import { useAction, useData } from "../data";
import { ISSUE_LABEL, STEP_LABEL, t } from "../i18n";
import { ErrorNote, Push, Sim, StreamingText, Truck, useDialog } from "../ui";
import { play, reducedMotion } from "../whimsy";

const STEPS: Step[] = ["CONSENT", "DL", "PAN", "BANK", "SELFIE", "SUBMIT"];
const FAQS: Faq[] = ["why_bank", "data_safe", "no_pan", "person"];

const FAQ_LABEL: Record<Faq, Record<Lang, string>> = {
  why_bank: { en: "Why bank details?", hi: "बैंक क्यों चाहिए?" },
  data_safe: { en: "Is my data safe?", hi: "जानकारी सुरक्षित है?" },
  no_pan: { en: "No PAN card", hi: "PAN नहीं है" },
  person: { en: "Talk to a person", hi: "व्यक्ति से बात" },
};

const VARIANT_LABEL: Record<Variant, Record<Lang, string>> = {
  clean: { en: "Clear photo", hi: "साफ़ फोटो" },
  blurry: { en: "Blurry", hi: "धुंधली" },
  glare: { en: "Glare", hi: "चमक" },
  screen: { en: "Photo of a screen", hi: "स्क्रीन की फोटो" },
};

const AFTER_SUBMIT = new Set(["SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE", "REJECTED"]);

// Which milestone a notification's link points at.
function stepForLink(link: string | null, next: Step | null): Step | null {
  if (!link) return null;
  if (link.includes("consent")) return "CONSENT";
  if (link.endsWith("/dl") || link.endsWith("/licence")) return "DL";
  if (link.endsWith("/pan")) return "PAN";
  if (link.endsWith("/bank_proof")) return next === "SUBMIT" ? "SUBMIT" : "BANK";
  if (link.endsWith("/selfie")) return "SELFIE";
  if (link.includes("status")) return "SUBMIT";
  return next;
}

// Progress as a road trip: milestones along the way, and our truck at the step you're on.
function RoadStepper({ view, focus }: { view: DriverView; focus: string | null }) {
  const lang = view.driver.language;
  const status = view.driver.status;
  const done: Record<Step, boolean> = {
    CONSENT: status !== "SIGNED_UP",
    DL: !!view.documents.DL && !view.documents.DL.issue && !(status === "LICENCE_EXPIRED" && view.nextStep === "DL"),
    PAN: !!view.documents.PAN && !view.documents.PAN.issue,
    BANK: view.steps.bank,
    SELFIE: view.steps.selfie,
    SUBMIT: AFTER_SUBMIT.has(status),
  };
  const finished = AFTER_SUBMIT.has(status);
  const index = finished ? STEPS.length - 1 : view.nextStep ? STEPS.indexOf(view.nextStep) : 0;
  const at = (index + 0.5) * (100 / STEPS.length);

  const [moving, setMoving] = useState(false);
  useEffect(() => {
    setMoving(true);
    const timer = setTimeout(() => setMoving(false), 950);
    return () => clearTimeout(timer);
  }, [index]);

  const [pulse, setPulse] = useState<Step | null>(null);
  useEffect(() => {
    const s = stepForLink(focus, view.nextStep);
    if (!s) return;
    setPulse(s);
    const timer = setTimeout(() => setPulse(null), 2800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="road" role="group" aria-label="KYC progress">
      <div className="road-truck" style={{ left: `${at}%` }}>
        <Truck size={40} className={moving ? "driving" : ""} />
      </div>
      <div className="road-lane">
        <span className="road-done" style={{ width: finished ? "100%" : `${at}%` }} />
      </div>
      <ol className="milestones" style={{ listStyle: "none", margin: "5px 0 0", padding: 0 }}>
        {STEPS.map((s) => {
          const state = !finished && view.nextStep === s ? "current" : done[s] ? "done" : "";
          return (
            <li key={s} className={`milestone ${state} ${pulse === s ? "pulse" : ""}`} aria-current={state === "current" ? "step" : undefined}>
              <span className="post" aria-hidden="true" />
              {STEP_LABEL[s][lang]}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DocTile({ label, doc, done, lang, simulatedLabel }: { label: string; doc?: DriverView["documents"][Slot]; done?: boolean; lang: Lang; simulatedLabel?: string }) {
  if (doc?.source === "digilocker") {
    return (
      <div className="doc-tile ok">
        <FolderDown size={16} aria-hidden="true" />
        {label}
        <Sim label="DigiLocker" />
      </div>
    );
  }
  if (doc) {
    return (
      <div className={`doc-tile ${doc.issue ? "issue" : "ok"}`}>
        {doc.url && <img src={doc.url} alt="" />}
        {doc.issue ? (ISSUE_LABEL[doc.issue]?.[lang] ?? doc.issue) : label}
      </div>
    );
  }
  if (done) {
    return (
      <div className="doc-tile ok">
        <CheckCircle2 size={16} aria-hidden="true" />
        {label}
        {simulatedLabel && <Sim label={simulatedLabel} />}
      </div>
    );
  }
  return <div className="doc-tile">{label}</div>;
}

function Bubble({ m, lang, stream }: { m: ChatMessage; lang: Lang; stream?: string }) {
  const kind =
    m.role === "driver"
      ? "driver"
      : m.role === "assistant"
        ? "assistant"
        : m.author === "reviewer"
          ? "reviewer"
          : m.author === "fleet owner"
            ? "owner"
            : "rules";
  const who =
    kind === "assistant"
      ? t(lang, "assistant")
      : kind === "rules"
        ? t(lang, "rules")
        : kind === "reviewer"
          ? t(lang, "reviewer")
          : kind === "owner"
            ? t(lang, "fleetOwner")
            : null;
  return (
    <div className={`bubble ${kind}`}>
      {who && (
        <span className="who">
          {who} {kind === "owner" && <Sim label="Owner app simulated" />}
        </span>
      )}
      {stream ? <StreamingText parts={[{ text: m.text }]} streamKey={stream} /> : m.text}
    </div>
  );
}

function CameraSheet({ id, slot, lang, onPick, onClose }: { id: string; slot: Slot; lang: Lang; onPick: (v: Variant) => void; onClose: () => void }) {
  const { data: shots } = useData(() => api.shots(id, slot), [id, slot]);
  const sheet = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t(lang, "cameraTitle")} tabIndex={-1} ref={sheet} onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <strong>{t(lang, "cameraTitle")}</strong>
          <Sim label="Specimen" />
        </div>
        <div className="shot-grid">
          {shots?.map((s) => (
            <button key={s.variant} className="shot" onClick={() => onPick(s.variant)}>
              <img src={s.url} alt={`Sample ${slot} photo: ${s.variant}`} />
              {VARIANT_LABEL[s.variant][lang]}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={onClose}>
          {t(lang, "cancel")}
        </button>
      </div>
    </div>
  );
}

// The KYC conversation: the road so far, status, documents, the assistant, and the one next action.
export function Kyc({ view, focus }: { view: DriverView; focus: string | null }) {
  const id = view.driver.id;
  const lang = view.driver.language;
  const { run, busy, error } = useAction();
  const [camera, setCamera] = useState<Slot | null>(null);
  const [reading, setReading] = useState(false); // a photo is with the reader: 10 to 25 s with a real model
  const chatRef = useRef<HTMLDivElement>(null);
  // Messages already there when this driver's chat opened show at once; later ones stream in. A reset
  // that shortens the chat starts the count again.
  const seen = useRef({ id, count: view.chat.length });
  if (seen.current.id !== id || view.chat.length < seen.current.count) seen.current = { id, count: view.chat.length };

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [view.chat.length, id, reading]);

  const step = view.nextStep;
  const photoSlot: Slot | null = step === "DL" || step === "PAN" ? step : null;

  const takePhoto = async (slot: Slot, variant: Variant) => {
    setReading(true);
    const r = await run(() => api.photo(id, slot, variant));
    setReading(false);
    if (r) play(r.issue ? "bonk" : "pop");
  };

  return (
    <div className="kyc">
      <RoadStepper view={view} focus={focus} />
      {view.driver.status !== "SIGNED_UP" && (
        <div className="docs-strip">
          <DocTile lang={lang} label={STEP_LABEL.DL[lang]} doc={view.documents.DL} />
          <DocTile lang={lang} label={STEP_LABEL.PAN[lang]} doc={view.documents.PAN} />
          <DocTile lang={lang} label={STEP_LABEL.BANK[lang]} done={view.steps.bank} simulatedLabel="Rs 1" />
          <DocTile lang={lang} label={STEP_LABEL.SELFIE[lang]} done={view.steps.selfie} simulatedLabel="Sim" />
        </div>
      )}

      <div className="chat" ref={chatRef} aria-live="polite">
        {view.chat.map((m, i) => (
          <Bubble key={`${m.at}-${i}`} m={m} lang={lang} stream={i >= seen.current.count && m.role !== "driver" ? `${id}-${i}-${m.at}` : undefined} />
        ))}
        {reading && (
          <div className="bubble assistant typing" role="status">
            <span className="dot" aria-hidden="true" />
            <span className="dot" aria-hidden="true" />
            <span className="dot" aria-hidden="true" />
            <span className="sr-only">{t(lang, "checkingPhoto")}</span>
          </div>
        )}
      </div>

      <div className="faq-row" role="group" aria-label="Quick questions">
        {FAQS.map((f) => (
          <button key={f} disabled={busy} onClick={() => run(() => api.ask(id, f))}>
            {FAQ_LABEL[f][lang]}
          </button>
        ))}
      </div>

      {step && (
        <div className="action-bar">
          {step === "CONSENT" && (
            <>
              <strong>{t(lang, "consentTitle")}</strong>
              <div className="consent">{t(lang, "consentBody")}</div>
              <Push block disabled={busy} onClick={() => run(() => api.consent(id))}>
                {t(lang, "agree")}
              </Push>
            </>
          )}
          {photoSlot && (
            <>
              <div className="row" style={{ gap: 10 }}>
                {/* A lapsed licence is renewed through DigiLocker: the demo camera only has the old card. */}
                {view.driver.status !== "LICENCE_EXPIRED" && (
                  <Push style={{ flex: 1 }} disabled={busy} onClick={() => setCamera(photoSlot)}>
                    <Camera size={17} aria-hidden="true" /> {t(lang, "takePhoto")}
                  </Push>
                )}
                <Push tone="plain" style={{ flex: 1 }} disabled={busy} onClick={() => run(() => api.digilocker(id, photoSlot))}>
                  <FolderDown size={17} aria-hidden="true" /> {t(lang, "useDigilocker")}
                </Push>
              </div>
              <div style={{ textAlign: "right", marginTop: -4 }}>
                <Sim />
              </div>
            </>
          )}
          {step === "BANK" && (
            <Push block disabled={busy} onClick={() => run(() => api.bankCheck(id)).then((r) => r && play("pop"))}>
              <IndianRupee size={17} aria-hidden="true" /> {t(lang, "payRs1")} <Sim />
            </Push>
          )}
          {step === "SELFIE" && (
            <Push block disabled={busy} onClick={() => run(() => api.selfie(id)).then((r) => r && play("pop"))}>
              <UserRound size={17} aria-hidden="true" /> {t(lang, "takeSelfie")} <Sim />
            </Push>
          )}
          {step === "SUBMIT" && (
            <Push block tone="gold" disabled={busy} onClick={() => run(() => api.submit(id))}>
              <Send size={17} aria-hidden="true" /> {view.driver.status === "NEEDS_FIX" ? t(lang, "submitAgain") : t(lang, "submit")}
            </Push>
          )}
          <ErrorNote message={error} />
        </div>
      )}
      {!step && <ErrorNote message={error} />}

      {camera && (
        <CameraSheet
          id={id}
          slot={camera}
          lang={lang}
          onClose={() => setCamera(null)}
          onPick={(variant) => {
            const slot = camera;
            setCamera(null);
            void takePhoto(slot, variant);
          }}
        />
      )}
    </div>
  );
}
