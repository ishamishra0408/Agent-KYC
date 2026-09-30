import { ListChecks, Sparkles, UserRound } from "lucide-react";
import { type ButtonHTMLAttributes, Fragment, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Lang, Status } from "./api";
import { STATUS_LABEL, STATUS_LABEL_HI } from "./i18n";
import { play, reducedMotion } from "./whimsy";

export function Sim({ label = "Simulated" }: { label?: string }) {
  return <span className="chip sim">{label}</span>;
}

const STATUS_TONE: Record<Status, string> = {
  SIGNED_UP: "neutral",
  CONSENTED: "neutral",
  DOCS_IN_PROGRESS: "neutral",
  SUBMITTED: "neutral",
  NEEDS_FIX: "fix",
  IN_REVIEW: "human",
  APPROVED: "rules",
  ACTIVE: "rules",
  LICENCE_EXPIRED: "fix",
  REJECTED: "danger",
};

export function StatusPill({ status, lang = "en" }: { status: Status; lang?: Lang }) {
  return <span className={`chip ${STATUS_TONE[status]}`}>{lang === "hi" ? STATUS_LABEL_HI[status] : STATUS_LABEL[status]}</span>;
}

// Where a piece of content came from. The whole UI's provenance language in one component.
// Who produced something. The icon repeats what the colour says, so colour is never the only cue.
const SOURCE_ICON = { ai: Sparkles, rules: ListChecks, human: UserRound } as const;

export function Source({ kind, children }: { kind: "ai" | "rules" | "human"; children: ReactNode }) {
  const Icon = SOURCE_ICON[kind];
  return (
    <span className={`chip source ${kind}`}>
      <Icon size={12} strokeWidth={2.4} className="chip-icon" aria-hidden="true" />
      {children}
    </span>
  );
}

// A liquid-glass button for the glass navigation layer: frosted, and in Chromium the backdrop also bends
// through an SVG displacement lens (#liquid-glass, drawn once by LiquidGlassFilter). Other browsers get
// the frost; high contrast and reduced transparency get a solid button (styles.css). Written for this
// app after the 21st.dev "Liquid Glass Button", whose code ships without a licence.
export function GlassButton({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`glass-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LiquidGlassFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="liquid-glass" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.011 0.028" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="1.4" result="lens" />
        <feDisplacementMap in="SourceGraphic" in2="lens" scale="16" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

// Text that arrives word by word, the way an AI answer streams, then settles into plain text with its
// citations as links to the elements sourceId names (a link opens the <details> around its source).
// The box takes its final size at once, citations included, so nothing below it jumps and a chat stays
// at its end. Screen readers get one copy of the whole text; without citations it stays put when the
// stream ends, so a live region speaks it once (the cited summary isn't in one). Reduced motion shows it at once, and a key that has streamed to the end once on this page
// shows at once after that. Written for this app after the 21st.dev
// "Streaming Text", whose code ships without a licence.
const streamed = new Set<string>();

export function StreamingText({
  parts,
  streamKey,
  sourceId,
}: {
  parts: { text: string; sources?: number[] }[];
  streamKey: string;
  sourceId?: (n: number) => string;
}) {
  const tokens = useMemo(() => parts.map((p) => p.text.split(/(\s+)/).filter(Boolean)), [parts]);
  const total = tokens.reduce((n, t) => n + t.length, 0);
  const full = parts.map((p) => p.text).join(" ");
  const [shown, setShown] = useState(() => (streamed.has(streamKey) || reducedMotion() ? Number.POSITIVE_INFINITY : 0));
  useEffect(() => {
    if (streamed.has(streamKey) || reducedMotion()) {
      setShown(Number.POSITIVE_INFINITY);
      return;
    }
    setShown(0);
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n + 2 >= total) {
          window.clearInterval(id);
          streamed.add(streamKey);
          return Number.POSITIVE_INFINITY;
        }
        return n + 2;
      });
    }, 34);
    return () => window.clearInterval(id);
  }, [streamKey, total]);

  const cite = (sources?: number[]) =>
    sourceId &&
    sources?.map((n) => (
      <a
        key={n}
        className="cite"
        href={`#${sourceId(n)}`}
        aria-label={`Source ${n}`}
        onClick={(e) => {
          // The hash is the router's, so move focus by hand.
          e.preventDefault();
          const item = document.getElementById(sourceId(n));
          item?.closest("details")?.setAttribute("open", "");
          item?.focus();
        }}
      >
        {n}
      </a>
    ));

  const done = shown >= total;
  if (done && sourceId && parts.some((p) => p.sources?.length)) {
    return (
      <span className="streaming">
        {parts.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            {p.text}
            {cite(p.sources)}
          </Fragment>
        ))}
      </span>
    );
  }
  let left = shown;
  return (
    <span className="streaming">
      <span className="sr-only">{full}</span>
      {done ? (
        <span aria-hidden="true">{full}</span>
      ) : (
        <span className="stream-frame" aria-hidden="true">
          <span className="stream-ghost">
            {parts.map((p, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                {p.text}
                {sourceId &&
                  p.sources?.map((n) => (
                    <span key={n} className="cite">
                      {n}
                    </span>
                  ))}
              </Fragment>
            ))}
          </span>
          <span className="stream-live">
            {tokens.map((t, i) => {
              const take = Math.max(0, Math.min(t.length, left));
              left -= take;
              return take ? (
                <Fragment key={i}>
                  {i > 0 && " "}
                  {t.slice(0, take).join("")}
                </Fragment>
              ) : null;
            })}
            <span className="stream-caret" />
          </span>
        </span>
      )}
    </span>
  );
}

// While data loads: grey lines in the shape of what's coming, announced once for screen readers.
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status">
      <span className="sr-only">Loading</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${92 - i * 14}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  return message ? (
    <p className="error-text" role="alert">
      {message}
    </p>
  ) : null;
}

// A keycap: it sits up off the page and presses down when you push it.
export function Push({
  children,
  tone = "primary",
  size = "md",
  block = false,
  className = "",
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "accent" | "plain"; size?: "sm" | "md"; block?: boolean }) {
  return (
    <button
      {...rest}
      className={`push ${tone} ${size} ${block ? "block" : ""} ${className}`}
      onClick={(e) => {
        play("click");
        onClick?.(e);
      }}
    >
      <span className="push-shadow" aria-hidden="true" />
      <span className="push-edge" aria-hidden="true" />
      <span className="push-front">{children}</span>
    </button>
  );
}

// The mark (D-044): an octahedron in flat tones lit from the top-left (lit, light, main and deep
// orange), over a soft slate shadow. The favicon in index.html is the same drawing.
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <filter id="brand-mark-shadow" x="-50%" y="-300%" width="200%" height="700%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <ellipse cx="16.4" cy="29.2" rx="7.6" ry="1.5" fill="#23282d" opacity="0.28" filter="url(#brand-mark-shadow)" />
      <polygon points="16,3.2 5.4,13.6 14.8,16.6" fill="#f2805f" />
      <polygon points="16,3.2 14.8,16.6 26.6,13.6" fill="#e8654b" />
      <polygon points="5.4,13.6 16,26.2 14.8,16.6" fill="#e04e39" />
      <polygon points="14.8,16.6 16,26.2 26.6,13.6" fill="#a93219" />
    </svg>
  );
}

// Our little truck. Cargo box, cab, two wheels: no borrowed artwork.
export function Truck({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`truck ${className}`} width={size} height={(size * 36) / 64} viewBox="0 0 64 36" aria-hidden="true">
      <rect x="2" y="5" width="38" height="21" rx="4" className="truck-cargo" />
      <rect x="7" y="10" width="12" height="3" rx="1.5" className="truck-stripe" />
      <path d="M40 11h11.5a3 3 0 0 1 2.3 1.1l6.2 7.4a3 3 0 0 1 .7 1.9V26H40z" className="truck-cab" />
      <path d="M44 14h7l4.5 5.5H44z" className="truck-window" />
      <g className="truck-wheel" style={{ transformOrigin: "14px 28px" }}>
        <circle cx="14" cy="28" r="5.5" />
        <circle cx="14" cy="28" r="2" className="truck-hub" />
      </g>
      <g className="truck-wheel" style={{ transformOrigin: "50px 28px" }}>
        <circle cx="50" cy="28" r="5.5" />
        <circle cx="50" cy="28" r="2" className="truck-hub" />
      </g>
    </svg>
  );
}

// Tabs the ARIA way (D-037): arrow keys, Home and End move between tabs, only the selected tab sits
// in the tab order, and each tab names the panel it controls, so a screen reader can say where it is.
export function tabList<T extends string>(keys: readonly T[], current: T, select: (key: T) => void, idPrefix: string) {
  const tabId = (key: T) => `${idPrefix}-tab-${key}`;
  const panelId = `${idPrefix}-panel`;
  const onKeyDown = (key: T) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = keys.indexOf(key);
    const next =
      e.key === "ArrowRight" ? keys[(i + 1) % keys.length]
      : e.key === "ArrowLeft" ? keys[(i - 1 + keys.length) % keys.length]
      : e.key === "Home" ? keys[0]
      : e.key === "End" ? keys[keys.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    select(next);
    document.getElementById(tabId(next))?.focus();
  };
  return {
    tab: (key: T) => ({
      role: "tab" as const,
      id: tabId(key),
      "aria-selected": key === current,
      "aria-controls": panelId,
      tabIndex: key === current ? 0 : -1,
      onKeyDown: onKeyDown(key),
    }),
    panel: { role: "tabpanel" as const, id: panelId, "aria-labelledby": tabId(current) },
  };
}

// A modal sheet: focus moves in when it opens and back when it closes, Tab stays inside it, and
// Escape closes it, as well as tapping outside.
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input, select, textarea")];
      if (focusable.length === 0) return;
      const [first, last] = [focusable[0], focusable[focusable.length - 1]];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // The button that opened the sheet is often busy (disabled) while the photo is read, and a
      // disabled button can't take focus, so its panel takes it instead of the page losing it.
      const usable = opener?.isConnected && !(opener as HTMLButtonElement).disabled;
      (usable ? opener : opener?.closest<HTMLElement>("[role=tabpanel]"))?.focus();
    };
  }, []);
  return ref;
}
