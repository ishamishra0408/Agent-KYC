import { useEffect, useRef, useState } from "react";
import { api, type EvalSummary } from "./api";
import { useData } from "./data";
import { SOURCE_ICON } from "./ui";
import { reducedMotion } from "./whimsy";

// Who decides (D-047): the three parts of a decision, wired left to right, each in its provenance colour,
// with a pulse travelling down each wire. After Magic UI's "Animated Beam" (MIT); none of its code is
// used. Still under reduced motion.
const NODES = [
  { kind: "ai", title: "AI reader", sub: "Gemma 4 31B, Claude Sonnet as backup", does: "Reads each photo into fields and flags" },
  { kind: "rules", title: "Policy", sub: "Rego on Open Policy Agent", does: "Approves, asks for a fix, or sends to a person" },
  { kind: "human", title: "Person", sub: "Ops reviewer", does: "Decides the hard cases, with a reason" },
] as const;

function Beam({ from, to }: { from: "ai" | "rules"; to: "rules" | "human" }) {
  const id = `beam-${from}-${to}`;
  return (
    <svg className="beam" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        {/* In the drawing's own units: a flat line has no height to measure a gradient against. */}
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2="100" y1="0" y2="0">
          <stop offset="0" className={`beam-stop ${from}`} />
          <stop offset="1" className={`beam-stop ${to}`} />
        </linearGradient>
      </defs>
      <line className="beam-wire" x1="0" y1="5" x2="100" y2="5" stroke={`url(#${id})`} />
      <line className="beam-pulse" x1="0" y1="5" x2="100" y2="5" stroke={`url(#${id})`} pathLength={100} />
    </svg>
  );
}

export function Pipeline() {
  return (
    <section className="pipeline" aria-labelledby="pipeline-title">
      <h2 id="pipeline-title" className="band-title">
        Who decides
      </h2>
      <ol className="pipeline-row">
        {NODES.map((n, i) => {
          const Icon = SOURCE_ICON[n.kind];
          return (
            <li key={n.kind} className="pipeline-step">
              {i > 0 && <Beam from={NODES[i - 1].kind as "ai" | "rules"} to={n.kind as "rules" | "human"} />}
              <div className={`pipeline-node ${n.kind}`}>
                <Icon className="pipeline-icon" size={20} strokeWidth={2.4} aria-hidden="true" />
                <strong>{n.title}</strong>
                <span className="small muted">{n.sub}</span>
                <span className="small">{n.does}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Counts up to its value once, when first scrolled into view; reduced motion shows the value at once.
// Screen readers get the value, never the numbers in between.
function Ticker({ value, decimals = 0, prefix = "" }: { value: number; decimals?: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / 1200);
          setShown(value * (1 - (1 - p) ** 3));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  const text = `${prefix}${value.toFixed(decimals)}`;
  return (
    <span ref={ref} className="ticker">
      <span aria-hidden="true">{`${prefix}${shown.toFixed(decimals)}`}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

// Does it work (D-047): the app's own reader on the made-up test cases, from the same results as the
// ops console's Tests tab, counted up once. After Magic UI's "Number Ticker" (MIT); none of its code is used.
export function Metrics() {
  const { data } = useData(() => api.evals(), []);
  if (!data) return null;
  const sum = (runs: EvalSummary[], key: "bad" | "badApproved" | "good" | "goodApproved" | "reads" | "costUsd") =>
    runs.reduce((n, r) => n + r[key], 0);
  const app = data.filter((e) => e.reader === "app");
  const oracle = data.filter((e) => e.reader === "oracle");
  if (app.length === 0 || oracle.length === 0) return null;
  const cases = sum(oracle, "bad") + sum(oracle, "good");
  const reads = sum(app, "reads");
  const perThousand = reads ? (sum(app, "costUsd") / reads) * 1000 : 0;
  return (
    <section className="metrics" aria-labelledby="metrics-title">
      <h2 id="metrics-title" className="band-title">
        Does it work?
      </h2>
      <dl className="metrics-row">
        <div>
          <dt>Made-up test cases</dt>
          <dd>
            <Ticker value={cases} />
          </dd>
        </div>
        <div>
          <dt>Bad cases approved</dt>
          <dd>
            <Ticker value={sum(app, "badApproved")} /> <span className="of">of {sum(app, "bad")}</span>
          </dd>
        </div>
        <div>
          <dt>Honest drivers approved</dt>
          <dd>
            <Ticker value={sum(app, "goodApproved")} /> <span className="of">of {sum(app, "good")}</span>
          </dd>
        </div>
        <div>
          <dt>Per 1,000 photos read</dt>
          <dd>
            <Ticker value={perThousand} decimals={2} prefix="$" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
