import { Check, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useData } from "../data";
import { istTime, PARTNER_LABEL, STATUS_LABEL } from "../i18n";
import { BLOCKER_LABEL, READER_LABEL, REASON_LABEL } from "../labels";
import { Source, tabList } from "../ui";
import { CaseDetail } from "./CaseDetail";

type Tab = "review" | "why" | "nudges" | "funnel" | "tests";

function ReviewQueue({ onOpenDriver }: { onOpenDriver?: (id: string) => void }) {
  const { data: queue } = useData(() => api.review(), []);
  const [selected, setSelected] = useState<string | null>(null);
  if (!queue) return <div className="empty">Loading…</div>;
  if (queue.length === 0) return <div className="empty">Nothing waiting for a person right now.</div>;
  const current = selected && queue.some((q) => q.id === selected) ? selected : queue[0].id;
  return (
    <div className="review-grid">
      <div className="queue" role="group" aria-label="Cases waiting for a person">
        {queue.map((q) => (
          <button key={q.id} aria-pressed={q.id === current} onClick={() => setSelected(q.id)}>
            <div className="spread">
              <strong>{q.name}</strong>
              <span className="faint small">{istTime(q.since)}</span>
            </div>
            <span className="small muted">{PARTNER_LABEL[q.partnerType] ?? q.partnerType}</span>
            <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
              {q.reasons.map((r) => (
                <span key={r} className="chip neutral">
                  {REASON_LABEL[r] ?? r}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <CaseDetail key={current} id={current} canDecide onOpenDriver={onOpenDriver} />
    </div>
  );
}

function WhyView({ id, onPick }: { id: string | null; onPick: (id: string) => void }) {
  const { data: state } = useData(() => api.state(), []);
  const current = id ?? state?.drivers.find((d) => d.status !== "SIGNED_UP")?.id ?? null;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row small" style={{ flexWrap: "wrap" }}>
        <label className="row">
          <select value={current ?? ""} onChange={(e) => onPick(e.target.value)} aria-label="Driver">
            {state?.drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {STATUS_LABEL[d.status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {current && <CaseDetail key={current} id={current} />}
    </div>
  );
}

function NudgeLog({ onWhy }: { onWhy: (id: string) => void }) {
  const { data } = useData(() => api.nudges(), []);
  return (
    <div className="stack">
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Time (IST)</th>
              <th>Driver</th>
              <th>Stuck on</th>
              <th>Action</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((n, i) => (
              <tr key={`${n.at}-${n.driverId}-${i}`}>
                <td style={{ whiteSpace: "nowrap" }}>{istTime(n.at, true)}</td>
                <td>
                  <button className="btn ghost small" onClick={() => onWhy(n.driverId)}>
                    {n.driver}
                  </button>
                </td>
                <td>{BLOCKER_LABEL[n.blocker] ?? n.blocker}</td>
                <td className={n.action === "hold" ? "muted" : undefined}>{n.action === "hold" ? "Held" : n.action === "send" ? "Sent" : "Status update"}</td>
                <td>
                  {n.text ? (
                    <div className="stack" style={{ gap: 4 }}>
                      {n.writer === "system" ? (
                        <Source kind="rules">Fixed status text</Source>
                      ) : (
                        <Source kind="ai">Nudge writer · templates</Source>
                      )}
                      <span>{n.text}</span>
                      {n.deepLink && <span className="faint small">Opens {n.deepLink}</span>}
                    </div>
                  ) : (
                    <span className="faint">
                      {n.reason}
                      {n.notBefore && ` · not before ${istTime(n.notBefore, true)}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelView() {
  const { data } = useData(() => api.funnel(), []);
  if (!data) return <div className="empty">Loading…</div>;
  const max = Math.max(1, ...data.stages.map((s) => s.count));
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stack">
        {data.stages.map((s) => (
          <div key={s.key} className="funnel-row">
            <span className="small">{s.label}</span>
            <div className="funnel-bar" aria-hidden="true">
              <span style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <strong>{s.count}</strong>
          </div>
        ))}
      </div>
      <div className="metric-grid">
        <div className="metric">
          <div className="small muted">Decided by the rules alone</div>
          <div className="value">{pct(data.decidedWithoutPerson)}</div>
        </div>
        <div className="metric">
          <div className="small muted">With a reviewer now</div>
          <div className="value">{data.now.inReview}</div>
        </div>
        <div className="metric">
          <div className="small muted">Waiting on a fix</div>
          <div className="value">{data.now.needsFix}</div>
        </div>
        <div className="metric">
          <div className="small muted">Nudges sent per approval</div>
          <div className="value">{data.nudgesPerActivated === null ? "—" : data.nudgesPerActivated.toFixed(1)}</div>
        </div>
      </div>
    </div>
  );
}

function TestsTab() {
  const { data } = useData(() => api.evals(), []);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Set</th>
              <th>Reader</th>
              <th>Bad approved</th>
              <th>Good approved</th>
              <th>Gate</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((e) => (
              <tr key={`${e.suite}-${e.reader}`}>
                <td className="muted">{e.suite === "holdout" ? "Holdout" : "Main"}</td>
                <td>
                  <strong>{READER_LABEL[e.reader] ?? e.reader}</strong>
                </td>
                <td>
                  {e.badApproved} of {e.bad}
                </td>
                <td>
                  {e.goodApproved} of {e.good}
                </td>
                <td className={`result ${e.gatePassed ? "pass" : "fail"}`}>
                  {e.gatePassed ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <X size={14} strokeWidth={3} aria-hidden="true" />}
                  {e.gatePassed ? "Pass" : "Fail"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The ops console: where people handle what the rules send them, and see why everything happened.
export function OpsConsole({ bare = false, onOpenDriver }: { bare?: boolean; onOpenDriver?: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("review");
  const [whyId, setWhyId] = useState<string | null>(null);
  const { data: queue } = useData(() => api.review(), []);
  const tabs: { key: Tab; label: string }[] = [
    { key: "review", label: `Review queue${queue ? ` (${queue.length})` : ""}` },
    { key: "why", label: "All drivers" },
    { key: "nudges", label: "Nudges" },
    { key: "funnel", label: "Funnel" },
    { key: "tests", label: "Tests" },
  ];
  const aria = tabList(tabs.map((t) => t.key), tab, setTab, bare ? "ops-bare" : "ops");
  return (
    <section className={`card ops ${bare ? "bare" : ""}`} aria-label="Ops console">
      <div className="spread ops-head" style={{ flexWrap: "wrap" }}>
        {bare ? <h1>Ops console</h1> : <h2>Ops console</h2>}
      </div>
      <nav className="ops-tabs" role="tablist" aria-label="Ops sections">
        {tabs.map((t) => (
          <button key={t.key} {...aria.tab(t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="ops-body" {...aria.panel} tabIndex={-1}>
        {tab === "review" && <ReviewQueue onOpenDriver={onOpenDriver} />}
        {tab === "why" && <WhyView id={whyId} onPick={setWhyId} />}
        {tab === "nudges" && (
          <NudgeLog
            onWhy={(id) => {
              setWhyId(id);
              setTab("why");
            }}
          />
        )}
        {tab === "funnel" && <FunnelView />}
        {tab === "tests" && <TestsTab />}
      </div>
    </section>
  );
}
