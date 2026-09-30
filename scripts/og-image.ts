import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// The link preview card (1200 x 630) for the live demo, and the picture at the top of the README: the
// wordmark with its KYC block in the accent, one line of value, and the demo screenshot (docs/demo.jpg).
// Public skin only. Usage: npm run og (after re-shooting docs/demo.jpg)
const root = fileURLToPath(new URL("..", import.meta.url));
const W = 1200;
const H = 630;
// The light theme's tokens (src/styles.css): --bg, --text (also --on-accent), --text-2, --accent.
const BG = "#e9ebf2";
const TEXT = "#0e0a0f";
const TEXT_2 = "#48464e";
const ACCENT = "#e04f38";

const text = (markup: string, font: string, width?: number) =>
  sharp({ text: { text: markup, font, dpi: 72, rgba: true, ...(width ? { width, wrap: "word" as const } : {}) } })
    .png()
    .toBuffer({ resolveWithObject: true });

const TITLE = "Helvetica Neue Bold 50";
const [agent, kyc, ready] = await Promise.all([
  text(`<span foreground="${TEXT}">Agent</span>`, TITLE),
  text(`<span foreground="${TEXT}">KYC</span>`, TITLE),
  text(`<span foreground="${TEXT}">Ready</span>`, TITLE),
]);
const line = await text(
  `<span foreground="${TEXT_2}">Driver KYC, rebuilt AI-first: a model reads the documents, a policy decides, people decide the hard cases.</span>`,
  "Helvetica Neue 27",
  430,
);
const url = await text(`<span foreground="${TEXT_2}">agent-kycready.onrender.com</span>`, "Helvetica Neue Medium 20");

// The wordmark: "Agent", a space, then KYC on an accent block, then "Ready" right after it.
const x0 = 64;
const titleY = 176;
const pad = 7;
const kycX = x0 + agent.info.width + 14;
const readyX = kycX + kyc.info.width + pad * 2 + 2;
const block = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${kyc.info.width + pad * 2}" height="${kyc.info.height + 4}"><rect width="100%" height="100%" rx="7" fill="${ACCENT}"/></svg>`,
);

// The screenshot, rounded, over a soft slate shadow.
const shotW = 600;
const shotH = Math.round((shotW * 533) / 800);
const shotX = W - shotW - 52;
const shotY = Math.round((H - shotH) / 2);
const corners = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotW}" height="${shotH}"><rect width="100%" height="100%" rx="14" fill="#fff"/></svg>`);
const shot = await sharp(readFileSync(path.join(root, "docs", "demo.jpg")))
  .resize(shotW, shotH)
  .composite([{ input: corners, blend: "dest-in" }])
  .png()
  .toBuffer();
const shadow = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotW + 60}" height="${shotH + 60}"><rect x="30" y="38" width="${shotW}" height="${shotH}" rx="14" fill="rgba(24,30,45,0.2)"/></svg>`),
)
  .blur(14)
  .png()
  .toBuffer();

mkdirSync(path.join(root, "public"), { recursive: true });
const out = path.join(root, "public", "og.jpg");
await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
  .composite([
    { input: agent.data, left: x0, top: titleY },
    { input: block, left: kycX, top: titleY - 2 },
    { input: kyc.data, left: kycX + pad, top: titleY },
    { input: ready.data, left: readyX, top: titleY },
    { input: line.data, left: x0, top: titleY + agent.info.height + 30 },
    { input: url.data, left: x0, top: H - 64 - url.info.height },
    { input: shadow, left: shotX - 30, top: shotY - 30 },
    { input: shot, left: shotX, top: shotY },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(out);
console.log(`public/og.jpg: ${W} x ${H}`);
