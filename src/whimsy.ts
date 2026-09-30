import { useCallback, useEffect, useState } from "react";
import { readStored, writeStored } from "./data";

// Small delights, all optional: synthesized sounds (off by default), confetti, theme.
// Everything here respects "reduce motion" and never blocks an action.

// ---------- Preferences ----------
type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (readStored("kycready.theme") as Theme | null) ?? "system");
  useEffect(() => applyTheme(theme), [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const current = t === "system" ? (systemDark ? "dark" : "light") : t;
      const next: Theme = current === "dark" ? "light" : "dark";
      writeStored("kycready.theme", next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

export function isDarkNow(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

let soundOn = readStored("kycready.sound") === "on";

export function useSoundToggle(): [boolean, () => void] {
  const [on, setOn] = useState(soundOn);
  const toggle = useCallback(() => {
    soundOn = !soundOn;
    writeStored("kycready.sound", soundOn ? "on" : "off");
    setOn(soundOn);
    if (soundOn) play("pop");
  }, []);
  return [on, toggle];
}

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------- Sounds (synthesized, no audio files) ----------
let audio: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
  audio ??= new AudioContext();
  const ctx = audio;
  if (ctx.state === "suspended") void ctx.resume();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  click: () => tone(1500, 0.035, "triangle", 0.035),
  pop: () => tone(480, 0.09, "sine", 0.06, 0, 900),
  bonk: () => tone(300, 0.12, "sine", 0.06, 0, 180),
  chime: () => {
    tone(880, 0.22, "sine", 0.05);
    tone(1320, 0.3, "sine", 0.04, 0.1);
    tone(1760, 0.34, "sine", 0.03, 0.2);
  },
  honk: () => {
    tone(415, 0.14, "square", 0.025);
    tone(330, 0.14, "square", 0.02);
    tone(415, 0.2, "square", 0.025, 0.2);
    tone(330, 0.2, "square", 0.02, 0.2);
  },
  stamp: () => tone(170, 0.1, "triangle", 0.09, 0, 80),
} as const;

export type SoundName = keyof typeof SOUNDS;

export function play(name: SoundName): void {
  if (!soundOn) return;
  try {
    SOUNDS[name]();
  } catch {
    // audio unavailable: stay quiet
  }
}

// ---------- Confetti: parcels, cones and route pins, in brand colours only ----------
// (never the provenance colours, which always mean who decided something)
const PIECES = ["parcel", "cone", "pin", "dot"] as const;
const COLORS = ["var(--primary)", "var(--gold)", "var(--kraft)", "var(--caramel)", "var(--primary-edge)"];

export function confetti(container: HTMLElement | null, count = 34): void {
  if (!container || reducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = `confetti ${PIECES[i % PIECES.length]}`;
    piece.style.setProperty("--x", `${(Math.random() - 0.5) * 320}px`);
    piece.style.setProperty("--y", `${260 + Math.random() * 280}px`);
    piece.style.setProperty("--r", `${(Math.random() - 0.5) * 900}deg`);
    piece.style.setProperty("--d", `${900 + Math.random() * 700}ms`);
    piece.style.setProperty("--c", COLORS[i % COLORS.length]);
    piece.style.left = `${40 + Math.random() * 20}%`;
    layer.appendChild(piece);
  }
  container.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1900);
}
