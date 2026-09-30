import { useEffect, useRef } from "react";
import { reducedMotion } from "./whimsy";

// Dust in the light (D-046): a few dozen faint motes drifting up behind the page in the theme's warm
// tones, redrawn about 30 times a second. Not drawn while the system asks for reduced motion (checked as
// it changes), hidden in high contrast (styles.css), and paused by the browser in a background tab.
// Colours follow the theme as it changes.
const COUNT = 36;
const TONES = ["--kraft", "--caramel", "--accent"];

export function AmbientMotes() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let colours: string[] = [];
    const readColours = () => {
      const style = getComputedStyle(document.documentElement);
      colours = TONES.map((name) => style.getPropertyValue(name).trim());
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const motes = Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      rise: 4 + Math.random() * 10, // px a second
      sway: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.12 + Math.random() * 0.28,
      tone: i % TONES.length,
    }));
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y -= (m.rise * dt) / h;
        if (m.y < -0.02) {
          m.y = 1.02;
          m.x = Math.random();
        }
        ctx.globalAlpha = m.alpha;
        ctx.fillStyle = colours[m.tone];
        ctx.beginPath();
        ctx.arc(m.x * w + Math.sin(t / 2400 + m.phase) * m.sway, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      raf = reducedMotion() ? 0 : requestAnimationFrame(frame);
      if (!raf) ctx.clearRect(0, 0, w, h);
    };
    readColours();
    resize();
    const theme = new MutationObserver(readColours);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", readColours);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener("change", start);
    window.addEventListener("resize", resize);
    start();
    return () => {
      cancelAnimationFrame(raf);
      theme.disconnect();
      scheme.removeEventListener("change", readColours);
      motion.removeEventListener("change", start);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={ref} className="ambient-motes" aria-hidden="true" />;
}
