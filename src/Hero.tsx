import { ArrowDown } from "lucide-react";
import { Fragment } from "react";
import { Push, SOURCE_ICON } from "./ui";

// The thesis, above the demo (D-046): who does what, marked in the provenance colours the whole app
// uses to say who produced something (purple an AI slot, green the rules, blue a person). Each clause
// fades in with its line drawn under it; reduced motion shows it at once. The button scrolls to the demo.
const PARTS = [
  { kind: "ai", text: "A model reads the documents," },
  { kind: "rules", text: "a policy decides," },
  { kind: "human", text: "people decide the hard cases." },
] as const;

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-inner">
        <h1 id="hero-title" className="hero-title">
          {PARTS.map((p, i) => {
            const Icon = SOURCE_ICON[p.kind];
            return (
              <Fragment key={p.kind}>
                {i > 0 && " "}
                <span className={`hero-part ${p.kind}`}>
                  <Icon className="hero-icon" strokeWidth={2.4} aria-hidden="true" />
                  {p.text}
                </span>
              </Fragment>
            );
          })}
        </h1>
        <div>
          <Push tone="accent" onClick={onStart}>
            Try the demo <ArrowDown size={16} strokeWidth={2.6} aria-hidden="true" />
          </Push>
        </div>
      </div>
    </section>
  );
}
