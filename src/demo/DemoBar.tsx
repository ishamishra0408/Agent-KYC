import { Clock, Moon, RotateCcw, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useAction, useData } from "../data";
import { istTime, PARTNER_LABEL, STATUS_LABEL } from "../i18n";
import { Push, Truck } from "../ui";
import { isDarkNow, play, useSoundToggle } from "../whimsy";

// Demo controls: whose phone you're holding, the demo clock, theme, sound, and a reset.
export function DemoBar({
  driverId,
  onDriver,
  theme,
  onTheme,
}: {
  driverId: string;
  onDriver: (id: string) => void;
  theme: "light" | "dark" | "system";
  onTheme: () => void;
}) {
  const { data } = useData(() => api.state(), []);
  const { run, busy, error } = useAction();
  const [toast, setToast] = useState<string | null>(null);
  const [soundOn, toggleSound] = useSoundToggle();
  const dark = isDarkNow(theme);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const advance = async (hours: number) => {
    const r = await run(() => api.advance(hours));
    if (!r) return;
    const sent = r.cycle.filter((i) => i.action === "send").length;
    const updates = r.cycle.filter((i) => i.action === "status_update").length;
    const held = r.cycle.filter((i) => i.action === "hold").length;
    play(sent > 0 ? "pop" : "click");
    const parts = [sent && `${sent} sent`, updates && `${updates} status ${updates === 1 ? "update" : "updates"}`, held && `${held} held`].filter(Boolean);
    setToast(`${istTime(r.clock, true)} · ${parts.length > 0 ? parts.join(" · ") : "no nudges due"}`);
  };

  return (
    <header className="demo-bar">
      <h1 className="brand boop">
        <span className="brand-mark">
          <Truck size={38} />
        </span>
        <span>
          Agent <span className="accent">KYC</span>Ready
        </span>
      </h1>

      <label className="row small">
        <select value={driverId} onChange={(e) => onDriver(e.target.value)} aria-label="Whose phone">
          {data?.drivers.map((d) => (
            <option key={d.id} value={d.id} title={PARTNER_LABEL[d.partnerType] ?? d.partnerType}>
              {d.name} · {STATUS_LABEL[d.status]}
            </option>
          ))}
        </select>
      </label>

      <span className="clock small" title="Demo clock (IST)">
        <Clock size={14} aria-hidden="true" />
        {data ? istTime(data.clock, true) : "…"} IST
      </span>
      <div className="row" role="group" aria-label="Move the demo clock">
        <Push size="sm" tone="plain" disabled={busy} onClick={() => advance(12)}>
          +12 h
        </Push>
        <Push size="sm" tone="plain" disabled={busy} onClick={() => advance(48)}>
          +2 days
        </Push>
        <Push size="sm" tone="plain" disabled={busy} onClick={() => advance(168)}>
          +1 week
        </Push>
      </div>
      <button
        className="btn small ghost boop"
        disabled={busy}
        onClick={() => run(() => api.reset()).then((r) => r && setToast("Reset to Tue 29 Sep, 10 AM"))}
      >
        <RotateCcw size={14} aria-hidden="true" /> Reset
      </button>

      <span className="row small" style={{ marginLeft: "auto" }}>
        <button className="icon-btn boop" onClick={toggleSound} aria-label={soundOn ? "Turn sounds off" : "Turn sounds on"} aria-pressed={soundOn}>
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button
          className="icon-btn boop"
          onClick={onTheme}
          aria-label={dark ? "Switch to Morning depot (light theme)" : "Switch to Night highway (dark theme)"}
          title={dark ? "Morning depot (light)" : "Night highway (dark)"}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </span>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
      {/* Outside the bar: its frosted-glass blur would trap a fixed-position toast inside it. */}
      {toast &&
        createPortal(
          <div className="toast" role="status">
            {toast}
          </div>,
          document.body,
        )}
    </header>
  );
}
