import { useRef } from "react";
import { GlassButton, Truck } from "./ui";

// How it works (D-043): the four steps as cards on a track. Scrolling pans the track: each card turns in
// from the right, sits flat in the middle, then turns away to the left. Below, the steps are stops on a
// road: the truck drives from stop to stop with the cards, and the glass buttons jump to a step (D-045).
// Scroll-driven CSS where the browser has it; elsewhere, under reduced motion and on narrow screens, the
// cards sit in a plain grid. The motion follows Hyperiux Vault's "Cards Rotate Slider" on 21st.dev
// (MIT), but none of its code is used: that one runs on GSAP, this is CSS.
const STEPS = [
  {
    key: "nudge",
    step: "Nudge",
    title: "one message about the blocker",
    alt: "A driver's inbox with one nudge: the name on the bank account doesn't match the licence",
  },
  {
    key: "read",
    step: "Read",
    title: "a blurry photo caught",
    alt: "The KYC chat: a licence photo read as blurry, and a retake asked for",
  },
  {
    key: "decide",
    step: "Decide",
    title: "the hard case goes to a person",
    alt: "The ops console: a case sent to a person because its bank account is shared, with the reason and evidence",
  },
  {
    key: "unlock",
    step: "Unlock",
    title: "bookings open",
    alt: "Loads open to an approved driver, one of them booked",
  },
];

// Where each card sits flat, as a share of the section's sticky scroll: the plateaus of story-pan in
// styles.css.
const FLAT = [0.05, 0.35, 0.65, 0.95];

export function Story() {
  const ref = useRef<HTMLElement>(null);
  const show = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (el.offsetHeight - window.innerHeight) * FLAT[i], behavior: "smooth" });
  };
  return (
    <section ref={ref} className="story" aria-labelledby="story-title">
      <div className="story-stage">
        <h2 id="story-title" className="story-title">
          How it works
        </h2>
        <ol className="story-track">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`story-card s${i + 1}`}>
              <img src={`/story/${s.key}.jpg`} alt={s.alt} width={840} height={630} decoding="async" />
              <p className="story-caption">
                <span className="story-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <strong>{s.step}:</strong> {s.title}
                </span>
              </p>
            </li>
          ))}
        </ol>
        <nav className="story-nav" aria-label="Steps">
          <span className="story-truck" aria-hidden="true">
            <Truck size={36} />
          </span>
          {STEPS.map((s, i) => (
            <GlassButton key={s.key} className={`s${i + 1}`} aria-label={`Step ${i + 1}: ${s.step}`} onClick={() => show(i)}>
              {i + 1}
            </GlassButton>
          ))}
        </nav>
      </div>
    </section>
  );
}
