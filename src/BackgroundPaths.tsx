/*! Background paths: ported from Kokonut UI (https://github.com/kokonut-labs/kokonutui). @license MIT, Copyright (c) 2025 kokonutUI. Full notice: THIRD-PARTY-NOTICES.md. */
import { memo, useMemo } from "react";

// The same generated wave paths as Kokonut UI's "Background Paths", by @dorianbaffier, changed in two
// ways: they're drawn in the theme's warm tones instead of the original purple, pink and blue, and CSS
// moves them instead of motion/react, so the app takes no new dependency. They drift slowly as one layer,
// hold still under reduced motion and disappear in high-contrast mode (styles.css). The notice above is
// kept in the built bundle.

type Kind = "primary" | "secondary" | "accent";

function wavePath(index: number, position: number, type: Kind): string {
  const baseAmplitude = type === "primary" ? 150 : type === "secondary" ? 100 : 60;
  const phase = index * 0.2;
  const segments = type === "primary" ? 10 : type === "secondary" ? 8 : 6;
  const [startX, startY, endX, endY] = [2400, 800, -2400, -800 + index * 25];
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const eased = 1 - (1 - progress) ** 2;
    const baseX = startX + (endX - startX) * eased;
    const baseY = startY + (endY - startY) * eased;
    const amplitudeFactor = 1 - eased * 0.3;
    const wave1 = Math.sin(progress * Math.PI * 3 + phase) * (baseAmplitude * 0.7 * amplitudeFactor);
    const wave2 = Math.cos(progress * Math.PI * 4 + phase) * (baseAmplitude * 0.3 * amplitudeFactor);
    const wave3 = Math.sin(progress * Math.PI * 2 + phase) * (baseAmplitude * 0.2 * amplitudeFactor);
    points.push({ x: baseX * position, y: baseY + wave1 + wave2 + wave3 });
  }
  return points
    .map((point, i) => {
      if (i === 0) return `M ${point.x} ${point.y}`;
      const prev = points[i - 1];
      const tension = 0.4;
      return `C ${prev.x + (point.x - prev.x) * tension} ${prev.y}, ${prev.x + (point.x - prev.x) * (1 - tension)} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
}

const SETS: { type: Kind; count: number; opacity: (i: number) => number; width: (i: number) => number }[] = [
  { type: "primary", count: 12, opacity: (i) => 0.15 + i * 0.02, width: (i) => 4 + i * 0.3 },
  { type: "secondary", count: 15, opacity: (i) => 0.12 + i * 0.015, width: (i) => 3 + i * 0.25 },
  { type: "accent", count: 10, opacity: (i) => Math.min(1, 0.08 + i * 0.12), width: (i) => 2 + i * 0.2 },
];

export const BackgroundPaths = memo(function BackgroundPaths() {
  const groups = useMemo(
    () => SETS.map((set) => ({ type: set.type, paths: Array.from({ length: set.count }, (_, i) => ({ d: wavePath(i, 1, set.type), opacity: set.opacity(i), width: set.width(i) })) })),
    [],
  );
  return (
    <div className="bg-paths" aria-hidden="true">
      <svg viewBox="-2400 -800 4800 1600" preserveAspectRatio="xMidYMid slice" fill="none" focusable="false">
        <defs>
          <linearGradient id="bg-paths-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" className="bg-paths-stop-a" />
            <stop offset="50%" className="bg-paths-stop-b" />
            <stop offset="100%" className="bg-paths-stop-c" />
          </linearGradient>
        </defs>
        {groups.map((g) => (
          <g key={g.type} className={`bg-paths-${g.type}`}>
            {g.paths.map((p, i) => (
              <path key={i} d={p.d} stroke="url(#bg-paths-gradient)" strokeLinecap="round" strokeWidth={p.width} opacity={p.opacity} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
});
