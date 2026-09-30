import { ListChecks, Sparkles, UserRound } from "lucide-react";
import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import type { Lang, Status } from "./api";
import { STATUS_LABEL, STATUS_LABEL_HI } from "./i18n";
import { play } from "./whimsy";

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
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "gold" | "plain"; size?: "sm" | "md"; block?: boolean }) {
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
