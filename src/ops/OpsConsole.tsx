import { Check, X } from "lucide-react";
import { useState } from "react";
import { api, type DriverSummary, type EvalSummary, type Status } from "../api";
import { useData } from "../data";
import { istTime, PARTNER_LABEL, STATUS_LABEL, STEP_LABEL } from "../i18n";
import { BLOCKER_LABEL, READER_GROUPS, READER_LABEL, REASON_LABEL } from "../labels";
import { Skeleton, Source, StatusPill, tabList } from "../ui";
import { CaseDetail } from "./CaseDetail";

type Tab = "review" | "why" | "nudges" | "funnel" | "tests";

function ReviewQueue({ onOpenDriver }: { onOpenDriver?: (id: string) => void }) {
  const { data: queue } = useData(() => api.review(), []);
  const [selected, setSelected] = useState<string | null>(null);
  if (!queue) return <Skeleton lines={4} />;
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

// Everyone on the platform, the ones who need someone first, and the case behind whoever is picked.
const ATTENTION: Status[] = ["IN_REVIEW", "NEEDS_FIX", "LICENCE_EXPIRED", "SUBMITTED", "DOCS_IN_PROGRESS", "CONSENTED", "SIGNED_UP", "APPROVED", "ACTIVE", "REJECTED"];

function whereTheyAre(d: DriverSummary): string {
  switch (d.status) {
    case "IN_REVIEW":
      return "Waiting for a reviewer";
    case "NEEDS_FIX":
      return "Asked to fix something";
    case "LICENCE_EXPIRED":
      return "Licence expired: bookings locked";
    case "SUBMITTED":
      return "Being checked";
    case "APPROVED":
      return "Can book loads";
    case "ACTIVE":
      return "Booking loads";
    case "REJECTED":
      return "Not verified";
    case "SIGNED_UP":
      return "Hasn't started";
    default:
      return d.nextStep ? `Next: ${STEP_LABEL[d.nextStep].en}` : STATUS_LABEL[d.status];
  }
}

function AllDrivers({ id, onPick, onOpenDriver }: { id: string | null; onPick: (id: string) => void; onOpenDriver?: (id: string) => void }) {
  const { data: state } = useData(() => api.state(), []);
  if (!state) return <Skeleton lines={4} />;
  const drivers = [...state.drivers].sort((a, b) => ATTENTION.indexOf(a.status) - ATTENTION.indexOf(b.status));
  const current = id && drivers.some((d) => d.id === id) ? id : (drivers[0]?.id ?? null);
  return (
    <div className="review-grid">
      <div className="queue compact" role="group" aria-label="All drivers">
        {drivers.map((d) => (
          <button key={d.id} aria-pressed={d.id === current} onClick={() => onPick(d.id)}>
            <div className="spread">
              <strong>{d.name}</strong>
              <StatusPill status={d.status} />
            </div>
            <span className="small muted">
              {PARTNER_LABEL[d.partnerType] ?? d.partnerType} · {whereTheyAre(d)}
            </span>
          </button>
        ))}
      </div>
      {current && <CaseDetail key={current} id={current} onOpenDriver={onOpenDriver} />}
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

// Where drivers drop off on the way to a first load: each stage against sign-ups and against the
// step before, the biggest drop marked. The cards say what each ratio is out of.
function FunnelView() {
  const { data } = useData(() => api.funnel(), []);
  if (!data) return <Skeleton lines={4} />;
  const signedUp = Math.max(1, data.stages[0]?.count ?? 0);
  const lost = data.stages.map((s, i) => (i === 0 ? 0 : Math.max(0, data.stages[i - 1].count - s.count)));
  const worst = Math.max(...lost);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <table className="table funnel">
        <thead>
          <tr>
            <th>Stage</th>
            <th aria-hidden="true" />
            <th>Drivers</th>
            <th>Of sign-ups</th>
            <th>Drop-off</th>
          </tr>
        </thead>
        <tbody>
          {data.stages.map((s, i) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td className="funnel-cell" aria-hidden="true">
                <div className="funnel-bar">
                  <span style={{ width: `${(s.count / signedUp) * 100}%` }} />
                </div>
              </td>
              <td className="num">{s.count}</td>
              <td className="num muted">{pct(s.count / signedUp)}</td>
              <td className={`num ${lost[i] && lost[i] === worst ? "worst" : "muted"}`}>
                {i === 0 ? "" : lost[i] ? `−${lost[i]}` : "0"}
                {lost[i] > 0 && lost[i] === worst && <span className="sr-only"> (the biggest drop-off)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="metric-grid">
        <div className="metric">
          <div className="small muted">Decided by the rules alone</div>
          <div className="value">{data.decidedWithoutPerson === null ? "n/a" : pct(data.decidedWithoutPerson)}</div>
          <div className="small muted">
            {data.rulesAlone} of {data.rulesDecisions} decisions
          </div>
        </div>
        <div className="metric">
          <div className="small muted">Waiting for a reviewer</div>
          <div className="value">{data.now.inReview}</div>
          <div className="small muted">drivers now</div>
        </div>
        <div className="metric">
          <div className="small muted">Asked to fix something</div>
          <div className="value">{data.now.needsFix}</div>
          <div className="small muted">drivers now</div>
        </div>
        <div className="metric">
          <div className="small muted">Nudges per approved driver</div>
          <div className="value">{data.nudgesPerActivated === null ? "n/a" : data.nudgesPerActivated.toFixed(1)}</div>
          <div className="small muted">
            {data.nudgesSent} nudges, {data.approvedDrivers} approved
          </div>
        </div>
      </div>
    </div>
  );
}

// One row per reader, both case sets added up (each set on hover). The line above the table is the
// pass rule, and a result says why it failed.
function TestsTab() {
  const { data } = useData(() => api.evals(), []);
  if (!data) return <Skeleton lines={4} />;
  const byReader = new Map<string, EvalSummary[]>();
  for (const e of data) byReader.set(e.reader, [...(byReader.get(e.reader) ?? []), e]);
  const total = (runs: EvalSummary[], key: "bad" | "badApproved" | "good" | "goodApproved" | "unanswered" | "reads" | "costUsd") => runs.reduce((sum, r) => sum + r[key], 0);
  const perSet = (runs: EvalSummary[], a: "badApproved" | "goodApproved", of: "bad" | "good") =>
    runs.map((r) => `${r.suite === "holdout" ? "Written separately" : "Built with"}: ${r[a]} of ${r[of]}`).join(" · ");
  const bad = total(data.filter((e) => e.reader === "oracle"), "bad");
  const good = total(data.filter((e) => e.reader === "oracle"), "good");
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted">
        Every reader on the same {bad + good} made-up cases. To pass: approve none of the {bad} that must be stopped, miss at most one honest
        driver in each set, and answer every photo.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="table tests">
          <thead>
            <tr>
              <th>Reader</th>
              <th>Wrongly approved</th>
              <th>Honest drivers approved</th>
              <th>Per 1,000 photos</th>
              <th>Result</th>
            </tr>
          </thead>
          {READER_GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr className="group">
                <th colSpan={5} scope="colgroup">
                  {g.title}
                </th>
              </tr>
              {g.readers
                .filter((r) => byReader.has(r))
                .map((r) => {
                  const runs = byReader.get(r) ?? [];
                  const passed = runs.every((x) => x.gatePassed);
                  const [wrong, honest, of, missing] = [total(runs, "badApproved"), total(runs, "goodApproved"), total(runs, "good"), total(runs, "unanswered")];
                  const reads = total(runs, "reads");
                  const why = missing
                    ? `${missing} photo${missing > 1 ? "s" : ""} unanswered`
                    : wrong
                      ? `${wrong} wrongly approved`
                      : of - honest > 0
                        ? `${of - honest} honest driver${of - honest > 1 ? "s" : ""} not approved`
                        : "";
                  return (
                    <tr key={r}>
                      <th scope="row">{READER_LABEL[r] ?? r}</th>
                      <td title={perSet(runs, "badApproved", "bad")} className={wrong ? "bad-count" : undefined}>
                        {wrong} of {total(runs, "bad")}
                      </td>
                      <td title={perSet(runs, "goodApproved", "good")}>
                        {honest} of {of}
                      </td>
                      <td className="muted">{reads ? `$${((total(runs, "costUsd") / reads) * 1000).toFixed(2)}` : "n/a"}</td>
                      <td className={`result ${passed ? "pass" : "fail"}`}>
                        {passed ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <X size={14} strokeWidth={3} aria-hidden="true" />}
                        {passed ? "Pass" : "Fail"}
                        {why && <span className="why"> · {why}</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
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
        {tab === "why" && <AllDrivers id={whyId} onPick={setWhyId} onOpenDriver={onOpenDriver} />}
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
