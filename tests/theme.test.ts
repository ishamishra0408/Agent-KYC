import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Colour contracts for both themes, read straight from the style sheet: the two dark blocks stay
// identical, every token the UI uses is defined, and the colour pairs the UI actually draws stay
// readable (WCAG AA: 4.5:1 for text, 3:1 for focus rings, borders and indicator lines).
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const whimsy = readFileSync(new URL("../src/whimsy.ts", import.meta.url), "utf8");

type Tokens = Record<string, string>;
type Rgba = [number, number, number, number];

function block(selector: RegExp): Tokens {
  const body = css.match(selector)?.[1];
  if (!body) throw new Error(`No token block for ${selector}`);
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = block(/(?:^|\n):root \{([^}]*)\}/);
const darkBySystem = block(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/);
const darkByButton = block(/:root\[data-theme="dark"\] \{([^}]*)\}/);
const THEMES: Record<string, Tokens> = { light, dark: { ...light, ...darkByButton } };

function colour(tokens: Tokens, name: string): Rgba {
  const value = tokens[name];
  if (!value) throw new Error(`--${name} is not defined`);
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) return colour(tokens, ref[1]);
  const m = value.match(/^hsl\(([\d.]+)deg ([\d.]+)% ([\d.]+)%(?: \/ ([\d.]+))?\)$/);
  if (!m) throw new Error(`--${name} is not an hsl() colour: ${value}`);
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4), m[4] === undefined ? 1 : Number(m[4])];
}

const over = (top: Rgba, under: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as Rgba;
const luminance = ([r, g, b]: Rgba) =>
  [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

// Translucent colours (the dark theme's tints, the BOOKED stamp) are measured as drawn: on the card surface.
function contrast(tokens: Tokens, fg: string, bg: string, opacity = 1): number {
  const surface = colour(tokens, "surface");
  const back = over(colour(tokens, bg), surface);
  const front = colour(tokens, fg);
  const [a, b] = [luminance(over([front[0], front[1], front[2], front[3] * opacity], back)), luminance(back)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const TEXT: [string, string, number?][] = [
  ["text", "bg"], ["text", "surface"], ["text", "surface-2"],
  ["text-2", "surface"], ["text-2", "surface-2"],
  ["text-3", "bg"], ["text-3", "surface"], ["text-3", "surface-2"],
  ["on-primary", "primary"], ["on-gold", "gold"],
  ["link", "bg"], ["link", "surface"],
  ["sim", "bg"], ["sim", "surface"], ["sim", "surface-2"],
  ["ai", "ai-bg"], ["rules", "rules-bg"], ["human", "human-bg"], ["fix", "fix-bg"], ["danger", "danger-bg"],
  // decision buttons: hovered (surface-2) and selected (surface-3)
  ["rules", "surface-2"], ["fix", "surface-2"], ["danger", "surface-2"],
  ["rules", "surface-3"], ["fix", "surface-3"], ["danger", "surface-3"],
  // the BOOKED stamp is drawn at 85% opacity
  ["rules", "surface", 0.85],
  // who wrote a chat bubble, on the bubbles' grey (D-041)
  ["ai", "surface-2"], ["human", "surface-2"],
  // banner titles and test results, on cards
  ["rules", "surface"], ["fix", "surface"], ["human", "surface"],
];

// Controls inside the glass bars and on cards: wells, and the solid pill that marks the selection.
TEXT.push(["text", "glass-pill"], ["glass-accent", "glass-pill"], ["text-2", "glass-well"], ["text", "glass-well"]);
// Error text and SIMULATED chips don't reach AA on glass over every backdrop, so on glass they sit
// on their own solid ground (styles.css): measured there.
TEXT.push(["danger", "surface"]);

// Text on the glass bars (D-037), measured over the worst backdrop that can pass beneath them:
// black under the light theme's dark text, white under the dark theme's light text. The gloss at the
// top of each bar is included at its strongest.
const GLASS_TEXT = ["text", "text-2", "glass-accent"];
function onGlass(tokens: Tokens, theme: string, fg: string, well = false): number {
  const backdrop: Rgba = theme === "light" ? [0, 0, 0, 1] : [1, 1, 1, 1];
  const gloss = Number(tokens["glass-gloss"].match(/hsl\(0deg 0% 100% \/ ([\d.]+)\)/)?.[1] ?? 0);
  let back = over(colour(tokens, "glass"), backdrop);
  // Light text loses contrast under the gloss; dark text gains it, so only the dark theme counts it.
  if (theme === "dark") back = over([1, 1, 1, gloss], back);
  if (well) back = over(colour(tokens, "glass-well"), back);
  const [a, b] = [luminance(over(colour(tokens, fg), back)), luminance(back)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const NON_TEXT: [string, string][] = [
  ["focus", "bg"], ["focus", "surface"], ["focus", "surface-2"],
  ["gold-line", "surface"], // selected ops tab
  // provenance icons, and the accent lines on reasons and banners (D-041)
  ["ai", "surface"], ["rules", "surface"], ["human", "surface"], ["fix", "surface"], ["danger", "surface"],
  ["control-border", "surface"], ["control-border", "surface-2"],
];

describe("theme", () => {
  it("keeps text on the glass bars readable over any backdrop", () => {
    for (const [theme, tokens] of Object.entries(THEMES)) {
      for (const fg of GLASS_TEXT) expect(onGlass(tokens, theme, fg), `${theme}: ${fg} on glass`).toBeGreaterThanOrEqual(4.5);
      expect(onGlass(tokens, theme, "text", true), `${theme}: language switch on glass`).toBeGreaterThanOrEqual(4.5);
      expect(onGlass(tokens, theme, "focus"), `${theme}: focus ring on glass`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the two copies of the dark tokens identical", () => {
    expect(darkBySystem).toEqual(darkByButton);
  });

  it("defines every colour token the UI uses", () => {
    const setAtRuntime = new Set(["c", "d", "r", "x", "y"]); // per-piece confetti values, set from JS
    const used = [...`${css}\n${whimsy}`.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]).filter((n) => !setAtRuntime.has(n));
    for (const name of new Set(used)) expect(light[name], `--${name}`).toBeDefined();
  });

  for (const [theme, tokens] of Object.entries(THEMES)) {
    it(`keeps text readable in the ${theme} theme (4.5:1)`, () => {
      for (const [fg, bg, opacity] of TEXT) {
        const ratio = contrast(tokens, fg, bg, opacity);
        expect(ratio, `${theme}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`keeps focus rings, borders and indicators visible in the ${theme} theme (3:1)`, () => {
      for (const [fg, bg] of NON_TEXT) {
        const ratio = contrast(tokens, fg, bg);
        expect(ratio, `${theme}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
