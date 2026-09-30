import { Check, FolderDown, Smartphone } from "lucide-react";
import { useState } from "react";
import { api, type CaseView, type Choice, type FixStep, type Sharer, type Slot } from "../api";
import { useAction, useData } from "../data";
import { istTime, PARTNER_LABEL, STATUS_LABEL } from "../i18n";
import { CHECK_LABEL, FIELD_LABEL, FIX_STEP_LABEL, MODEL_LABEL, NOTICE_LABEL, OUTCOME_DONE, OUTCOME_LABEL, REASON_LABEL, SLOT_LABEL } from "../labels";
import { ErrorNote, Push, Sim, Source, StatusPill } from "../ui";
import { play } from "../whimsy";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const ACTOR_LABEL: Record<string, string> = { driver: "Driver", rules: "Rules", human: "Reviewer", reviewer: "Reviewer", system: "System", owner: "Fleet owner" };
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A passed check, with the fact a reviewer would otherwise have to hover for.
function checkLabel(p: NonNullable<CaseView["decision"]>["passed"][number]): string {
  const e = p.evidence ?? {};
  if (p.check === "DL_VALID" && e.validTill) return `Licence valid till ${String(e.validTill)}`;
  if (p.check === "BANK_VERIFIED" && e.ownersAccount) return "Paid into the fleet owner's account";
  return CHECK_LABEL[p.check] ?? p.check;
}

function evidenceText(e: Record<string, unknown> | undefined): string | null {
  if (!e) return null;
  const parts = Object.entries(e)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  return parts.length ? parts.join(" · ") : null;
}

// A shared bank account, drawn: the holder, and everyone paid into it.
function GraphView({ account }: { account: { accountId: string; holderName: string; sharers: Sharer[] } }) {
  const width = Math.max(520, account.sharers.length * 170);
  const col = width / account.sharers.length;
  return (
    <svg viewBox={`0 0 ${width} 170`} width="100%" role="img" aria-label={`Bank account held by ${account.holderName}, used by ${account.sharers.length} drivers`}>
      <rect x={width / 2 - 100} y={8} width={200} height={42} rx={8} className="g-account" />
      <text x={width / 2} y={26} textAnchor="middle" className="g-title">
        Bank account
      </text>
      <text x={width / 2} y={42} textAnchor="middle" className="g-sub">
        holder: {account.holderName}
      </text>
      {account.sharers.map((s, i) => {
        const cx = col * i + col / 2;
        const ok = s.isHolder || s.claimsHolderAsOwner;
        return (
          <g key={s.driverId}>
            <line x1={width / 2} y1={50} x2={cx} y2={112} className={ok ? "g-line-ok" : "g-line-bad"} />
            <rect x={cx - 72} y={112} width={144} height={46} rx={8} className={ok ? "g-node-ok" : "g-node-bad"} />
            <text x={cx} y={131} textAnchor="middle" className="g-title">
              {s.name}
            </text>
            <text x={cx} y={148} textAnchor="middle" className="g-sub">
              {s.isHolder ? "account holder" : s.claimsHolderAsOwner ? "names holder as owner" : "no link to holder"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DocumentCard({ slot, doc }: { slot: Slot; doc: NonNullable<CaseView["documents"][Slot]> }) {
  const fields = Object.entries(doc.fields).filter(([, v]) => v);
  return (
    <div className="doc-card">
      <div className="spread">
        <strong className="small">{SLOT_LABEL[slot]}</strong>
        {doc.source === "digilocker" ? (
          <Sim label="DigiLocker" />
        ) : !doc.readBy || doc.readBy === "simulated" ? (
          <Sim label="Simulated reader" />
        ) : (
          <span title={doc.fallbackReason ?? undefined}>
            <Source kind="ai">
              {MODEL_LABEL[doc.readBy] ?? doc.readBy}
              {doc.fallbackReason ? " · fallback" : ""}
            </Source>
          </span>
        )}
      </div>
      {doc.url ? (
        <img src={doc.url} alt={`${SLOT_LABEL[slot]} photo`} />
      ) : (
        <div className="doc-tile ok" style={{ minHeight: 80 }}>
          <FolderDown size={18} aria-hidden="true" />
          Fetched from DigiLocker
        </div>
      )}
      {doc.issue && <span className="chip fix">{REASON_LABEL[doc.issue] ?? doc.issue}</span>}
      {fields.length > 0 && (
        <dl className="kv">
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{FIELD_LABEL[k] ?? k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {doc.suspiciousText && (
        <div className="warn-box">
          <strong>Hidden text:</strong> “{doc.suspiciousText}”
        </div>
      )}
    </div>
  );
}

function DecisionForm({ id }: { id: string }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [step, setStep] = useState<FixStep | "">("");
  const [note, setNote] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const { run, busy, error } = useAction();

  const record = async () => {
    if (!choice) return setInvalid("Choose a decision first.");
    if (choice === "NEEDS_FIX" && !step) return setInvalid("Pick the step the driver should redo.");
    if (!note.trim()) return setInvalid("A reason is required for every decision.");
    setInvalid(null);
    const ok = await run(() => api.decide(id, choice, note.trim(), choice === "NEEDS_FIX" && step ? step : undefined));
    if (ok) {
      play("stamp");
      setNote("");
      setChoice(null);
      setStep("");
    }
  };

  return (
    <div className="decide">
      <strong>Your decision</strong>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {(["APPROVE", "NEEDS_FIX", "REJECT"] as Choice[]).map((c) => (
          <button
            key={c}
            className={`btn small ${c === "APPROVE" ? "approve" : c === "NEEDS_FIX" ? "fix" : "reject"} ${choice === c ? "selected" : ""}`}
            aria-pressed={choice === c}
            onClick={() => {
              setChoice(c);
              setInvalid(null);
            }}
          >
            {OUTCOME_LABEL[c]}
          </button>
        ))}
      </div>
      {choice === "NEEDS_FIX" && (
        <label className="stack" style={{ gap: 4 }}>
          <span className="small muted">Step to redo</span>
          <select
            value={step}
            onChange={(e) => {
              setStep(e.target.value as FixStep | "");
              setInvalid(null);
            }}
          >
            <option value="">Choose a step…</option>
            {(Object.keys(FIX_STEP_LABEL) as FixStep[]).map((s) => (
              <option key={s} value={s}>
                {FIX_STEP_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="stack" style={{ gap: 4 }}>
        <span className="small muted">
          {choice === "NEEDS_FIX" ? "Note to the driver" : "Reason"}
        </span>
        <textarea
          value={note}
          maxLength={500}
          onChange={(e) => {
            setNote(e.target.value);
            setInvalid(null);
          }}
        />
      </label>
      <ErrorNote message={invalid ?? error} />
      <div>
        <Push tone="gold" disabled={busy} onClick={record}>
          Record decision
        </Push>
      </div>
    </div>
  );
}

// Demo stand-in for the fleet owner confirming this driver in their own app.
function OwnerConfirm({ id }: { id: string }) {
  const { run, busy, error } = useAction();
  return (
    <div className="row">
      <button className="btn small" disabled={busy} onClick={() => run(() => api.confirmOwner(id)).then((r) => r && play("pop"))}>
        Confirm as their fleet owner
      </button>
      <Sim label="Owner app simulated" />
      <ErrorNote message={error} />
    </div>
  );
}

// Everything behind one driver's status: what the reader saw, what the rules checked, and why.
export function CaseDetail({ id, canDecide = false, onOpenDriver }: { id: string; canDecide?: boolean; onOpenDriver?: (id: string) => void }) {
  const { data: c, error } = useData(() => api.caseView(id), [id]);
  if (!c) return error ? <ErrorNote message={error.message} /> : <div className="empty">Loading…</div>;
  const d = c.decision;
  const slots = (Object.keys(c.documents) as Slot[]).filter((s) => c.documents[s]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 17 }}>{c.driver.name}</h2>
          <div className="small muted">
            {PARTNER_LABEL[c.driver.partnerType] ?? c.driver.partnerType} · {c.driver.phone}
            {c.driver.fleetOwnerId && ` · fleet owner ${c.driver.fleetOwnerId}, ${c.driver.ownerLinkVerified ? "confirmed" : "not confirmed"}`}
          </div>
        </div>
        <div className="row">
          <StatusPill status={c.driver.status} />
          {onOpenDriver && (
            <button className="btn small ghost" onClick={() => onOpenDriver(c.driver.id)}>
              <Smartphone size={14} aria-hidden="true" /> Their phone
            </button>
          )}
        </div>
      </div>

      {c.summary && (
        <p className="summary">
          <Source kind="ai">AI summary · template</Source>
          <span>{c.summary}</span>
        </p>
      )}

      {d ? (
        <Section title="Decision">
          <div className="small muted row" style={{ flexWrap: "wrap" }}>
            {d.actor === "rules" ? (
              <Source kind="rules">Rules {d.rulesVersion}</Source>
            ) : (
              <Source kind="human">Reviewer</Source>
            )}
            <span>
              <strong>{OUTCOME_DONE[d.outcome] ?? d.outcome}</strong> · {istTime(d.at, true)}
              {d.note && ` · “${d.note}”`}
            </span>
            {c.registrySimulated && <Sim label="Simulated checks" />}
          </div>
          {/* The summary already says why; a reason's own message and evidence are on hover. */}
          {d.reasons.map((r, i) => (
            <div key={`${r.code}-${i}`} className={`reason ${r.severity}`} title={[r.opsMessage, evidenceText(r.evidence)].filter(Boolean).join(" · ")}>
              <strong className="small">
                <span className="sr-only">{r.severity === "review" ? "Needs a person: " : "Fix: "}</span>
                {REASON_LABEL[r.code] ?? r.code}
              </strong>
              {r.doc && <span className="faint small">{SLOT_LABEL[r.doc]}</span>}
              {!c.summary && <span className="small muted">{r.opsMessage}</span>}
            </div>
          ))}
          {d.passed.length > 0 && (
            <ul className="checks" aria-label="Checks passed">
              {d.passed.map((p) => (
                <li key={p.check} title={evidenceText(p.evidence) ?? undefined}>
                  <Check size={13} strokeWidth={3} aria-hidden="true" />
                  {checkLabel(p)}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <p className="small muted">Not submitted yet.</p>
      )}

      {c.notices.length > 0 && (
        <Section title="Heads-up">
          {c.notices.map((n) => (
            <div key={n.code} className="reason" title={evidenceText(n.evidence) ?? undefined}>
              <strong className="small">{NOTICE_LABEL[n.code] ?? n.code}</strong>
              <span className="small muted">{n.opsMessage}</span>
            </div>
          ))}
        </Section>
      )}

      {slots.length > 0 && (
        <Section title="Documents">
          <div className="doc-grid">
            {slots.map((s) => {
              const doc = c.documents[s];
              return doc ? <DocumentCard key={s} slot={s} doc={doc} /> : null;
            })}
          </div>
        </Section>
      )}

      {c.driver.partnerType === "hired_driver" && c.driver.fleetOwnerId && !c.driver.ownerLinkVerified && (
        <OwnerConfirm id={c.driver.id} />
      )}

      {c.graph.status === "unavailable" ? (
        <Section title="Who uses this bank account">
          <p className="muted small">Couldn't reach {c.graphSource ?? "the graph"}.</p>
        </Section>
      ) : (
        c.graph.sharedBankAccount && (
          <Section title="Who uses this bank account">
            <div className="row">
              {c.graphSource && <span className="chip neutral">{c.graphSource}</span>}
              <Sim label="Demo drivers" />
            </div>
            <GraphView account={c.graph.sharedBankAccount} />
          </Section>
        )
      )}

      <Section title="Timeline">
        <ul className="timeline">
          {c.events.map((e, i) => (
            <li key={i}>
              <span>{istTime(e.at)}</span>
              <span>{ACTOR_LABEL[e.actor] ?? e.actor}</span>
              <span>{e.type === "status_changed" ? `${STATUS_LABEL[e.from as keyof typeof STATUS_LABEL] ?? e.from} → ${STATUS_LABEL[e.to as keyof typeof STATUS_LABEL] ?? e.to}` : sentenceCase(e.type.replace(/_/g, " "))}</span>
            </li>
          ))}
        </ul>
      </Section>

      {canDecide && c.driver.status === "IN_REVIEW" && <DecisionForm key={c.driver.id} id={c.driver.id} />}
    </div>
  );
}
