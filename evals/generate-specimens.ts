import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PERSONA_IDS, personaCase, SHOT_VARIANTS, shotDoc, shotId } from "../server/demo/shots";
import { CASES, INJECTION_TEXT, LOOKALIKE_TEXT, type SpecimenDoc } from "./cases";
import { SPECIMEN_DIR, specimenPath } from "./harness";
import { HOLDOUT_CASES } from "./holdout";

// Renders every eval document as a "phone photo" JPEG, with its defect applied.
// Deterministic: same cases in, same images out. Every card says SPECIMEN, uses a made-up
// person and a generic layout (no government emblems or real card designs).

const W = 1012; // card, ID-1 aspect ratio
const H = 638;
const PW = 1280; // photo canvas
const PH = 860;
const FONT = "Helvetica, Arial, sans-serif";
const MONO = "Courier New, Courier, monospace";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function field(label: string, value: string, x: number, y: number, opts: { size?: number; font?: string; patch?: boolean } = {}): string {
  const size = opts.size ?? 34;
  // A white patch behind the value mimics a pasted-over edit.
  const patch = opts.patch
    ? `<rect x="${x - 8}" y="${y + 8}" width="${Math.round(value.length * size * 0.62) + 16}" height="${size + 14}" fill="#ffffff"/>`
    : "";
  return (
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="20" fill="#5b6b7a">${esc(label)}</text>` +
    patch +
    `<text x="${x}" y="${y + size + 4}" font-family="${opts.font ?? FONT}" font-size="${size}" font-weight="700" fill="#14212e">${esc(value)}</text>`
  );
}

function silhouette(x: number): string {
  return (
    `<rect x="${x}" y="130" width="200" height="250" rx="14" fill="#c9d3dc"/>` +
    `<circle cx="${x + 100}" cy="222" r="52" fill="#8a99a8"/>` +
    `<path d="M${x + 20} 372 C${x + 20} 300 ${x + 180} 300 ${x + 180} 372 Z" fill="#8a99a8"/>`
  );
}

function injectionLine(d: SpecimenDoc): string {
  if (d.defect === "injection") return `<text x="40" y="574" font-family="${FONT}" font-size="17" fill="#34495e">${esc(INJECTION_TEXT)}</text>`;
  // Set just above the real notice, in its size and colour, so it reads as part of it.
  if (d.defect === "lookalike") return `<text x="40" y="${H - 52}" font-family="${FONT}" font-size="18" fill="#6b7785">${esc(LOOKALIKE_TEXT)}</text>`;
  return "";
}

function card(title: string, subtitle: string, bg: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="30" fill="${bg}" stroke="#5b6b7a" stroke-width="3"/>
<path d="M3 33 Q3 3 33 3 L${W - 33} 3 Q${W - 3} 3 ${W - 3} 33 L${W - 3} 100 L3 100 Z" fill="#1f3b57"/>
<text x="40" y="64" font-family="${FONT}" font-size="34" font-weight="700" fill="#ffffff">${esc(title)}</text>
<text x="${W - 40}" y="64" text-anchor="end" font-family="${FONT}" font-size="22" fill="#cfe0ef">${esc(subtitle)}</text>
${body}
<text x="${W / 2}" y="${H / 2 + 60}" text-anchor="middle" transform="rotate(-16 ${W / 2} ${H / 2})" font-family="${FONT}" font-size="110" font-weight="700" fill="#d62828" fill-opacity="0.16">SPECIMEN</text>
<text x="40" y="${H - 26}" font-family="${FONT}" font-size="18" fill="#6b7785">Test document for Agent KYCReady. Not a real document.</text>
</svg>`;
}

function dlSvg(d: SpecimenDoc): string {
  const p = d.printed;
  const nameOpts = d.defect === "tampered" ? { font: MONO, patch: true } : {};
  return card(
    "DRIVING LICENCE",
    "Specimen transport authority",
    "#eaf2f8",
    silhouette(44) +
      field("Licence no.", p.number ?? "", 290, 150) +
      field("Name", p.name ?? "", 290, 238, nameOpts) +
      field("Date of birth", fmtDate(p.dob), 290, 326) +
      field("Valid till", fmtDate(p.validTill), 620, 326) +
      field("Vehicle class", "LMV, LGV", 290, 414) +
      `<text x="290" y="520" font-family="${FONT}" font-size="20" fill="#5b6b7a">Address: 12 Specimen Road, Bengaluru 560001</text>` +
      injectionLine(d),
  );
}

function panSvg(d: SpecimenDoc): string {
  const p = d.printed;
  return card(
    "PAN CARD",
    "Permanent account number",
    "#f4efe6",
    field("Name", p.name ?? "", 40, 150, d.defect === "tampered" ? { font: MONO, patch: true } : {}) +
      field("Date of birth", fmtDate(p.dob), 40, 238) +
      field("Permanent account number", p.number ?? "", 40, 340, { size: 52 }) +
      silhouette(W - 244) +
      `<text x="40" y="470" font-family="${FONT}" font-size="20" fill="#5b6b7a">Signature</text>` +
      `<path d="M40 522 C90 482 130 542 180 502 S260 522 300 497" stroke="#14212e" stroke-width="3" fill="none"/>` +
      injectionLine(d),
  );
}

function bankSvg(d: SpecimenDoc): string {
  const p = d.printed;
  return card(
    "SPECIMEN BANK · PASSBOOK",
    "Savings account",
    "#eef6ee",
    field("Account holder", p.holderName ?? "", 40, 150) +
      field("Account number", `XXXX XXXX ${p.accountLast4 ?? ""}`, 40, 238) +
      field("IFSC", p.ifsc ?? "", 40, 326) +
      field("Branch", "Whitefield (specimen)", 520, 326) +
      `<text x="40" y="440" font-family="${FONT}" font-size="20" fill="#5b6b7a">Customer ID 00000000 · Opened 2019</text>` +
      injectionLine(d),
  );
}

function receiptSvg(): string {
  const lines = [
    "FUEL STATION (SPECIMEN)",
    "Pump 4 · Diesel",
    "Quantity 32.5 L",
    "Rate Rs 96.00 / L",
    "Amount Rs 3,120.00",
    "Date 21-09-2026 14:32",
    "Thank you. Visit again.",
  ];
  const text = lines
    .map((l, i) => `<text x="${W / 2}" y="${150 + i * 58}" text-anchor="middle" font-family="${MONO}" font-size="32" fill="#222222">${esc(l)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="6" fill="#fbfbf7" stroke="#bbbbbb" stroke-width="3"/>
${text}
<text x="${W / 2}" y="${H / 2 + 60}" text-anchor="middle" transform="rotate(-16 ${W / 2} ${H / 2})" font-family="${FONT}" font-size="110" font-weight="700" fill="#d62828" fill-opacity="0.16">SPECIMEN</text>
</svg>`;
}

function svgFor(doc: SpecimenDoc): string {
  switch (doc.kind) {
    case "DL":
      return dlSvg(doc);
    case "PAN":
      return panSvg(doc);
    case "BANK_PROOF":
      return bankSvg(doc);
    case "RECEIPT":
      return receiptSvg();
  }
}

// Glare sits over the card's fields: centre-right on the licence, left on PAN and passbook.
function glareSvg(kind: SpecimenDoc["kind"]): string {
  const cx = kind === "DL" ? 0.52 : 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">
<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
<stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
<stop offset="72%" stop-color="#ffffff" stop-opacity="1"/>
<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient></defs>
<ellipse cx="${PW * cx}" cy="${PH * 0.5}" rx="${PW * 0.4}" ry="${PH * 0.36}" fill="url(#g)"/>
</svg>`;
}

// A card shown on a phone or laptop screen: dark bezel, scanlines, a reflection.
async function screenPhoto(cardPng: Buffer): Promise<Buffer> {
  const sw = 1060;
  const sh = Math.round((sw * H) / W);
  const inner = await sharp(cardPng)
    .resize(sw, sh)
    .modulate({ brightness: 1.08, saturation: 0.85 })
    .tint({ r: 205, g: 222, b: 255 })
    .png()
    .toBuffer();
  const scan = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}">
<defs><pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
<rect width="6" height="3" fill="#000000" fill-opacity="0.13"/></pattern></defs>
<rect width="100%" height="100%" fill="url(#p)"/>
<rect x="${sw * 0.55}" y="0" width="${sw * 0.12}" height="${sh}" fill="#ffffff" fill-opacity="0.18" transform="skewX(-20)"/>
</svg>`;
  const screen = await sharp(inner).composite([{ input: Buffer.from(scan) }]).png().toBuffer();
  const bezel = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">
<rect width="100%" height="100%" fill="#6f655b"/>
<rect x="${(PW - sw) / 2 - 40}" y="${(PH - sh) / 2 - 40}" width="${sw + 80}" height="${sh + 80}" rx="46" fill="#111111"/>
<circle cx="${PW / 2}" cy="${(PH - sh) / 2 - 20}" r="7" fill="#333333"/>
</svg>`;
  return sharp(Buffer.from(bezel))
    .composite([{ input: screen, left: Math.round((PW - sw) / 2), top: Math.round((PH - sh) / 2) }])
    .png()
    .toBuffer();
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

async function toPhoto(doc: SpecimenDoc, seed: string): Promise<Buffer> {
  const cardPng = await sharp(Buffer.from(svgFor(doc))).png().toBuffer();

  if (doc.defect === "screen") {
    return sharp(await screenPhoto(cardPng)).jpeg({ quality: 82 }).toBuffer();
  }

  const angle = doc.defect === "tilted" ? 7 : ((hash(seed) % 5) - 2) * 0.8;
  const rotated = await sharp(cardPng).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(rotated).metadata();
  let buf = await sharp({ create: { width: PW, height: PH, channels: 3, background: { r: 156, g: 143, b: 128 } } })
    .composite([
      {
        input: rotated,
        left: Math.round((PW - (meta.width ?? W)) / 2),
        top: Math.round((PH - (meta.height ?? H)) / 2),
      },
    ])
    .png()
    .toBuffer();

  switch (doc.defect) {
    case "blurry":
      buf = await sharp(buf).blur(11).toBuffer();
      break;
    case "glare":
      buf = await sharp(buf).composite([{ input: Buffer.from(glareSvg(doc.kind)) }]).toBuffer();
      break;
    case "cropped":
      buf = await sharp(buf).extract({ left: 0, top: 0, width: PW, height: Math.round(PH * 0.42) }).toBuffer();
      break;
    case "dark":
      // Dim, low contrast and a little soft, like a photo taken under a weak bulb.
      buf = await sharp(buf).modulate({ brightness: 0.05 }).linear(0.3, 2).blur(3.2).toBuffer();
      break;
  }
  return sharp(buf).jpeg({ quality: 82 }).toBuffer();
}

mkdirSync(SPECIMEN_DIR, { recursive: true });
let count = 0;
for (const c of [...CASES, ...HOLDOUT_CASES]) {
  for (const slot of ["DL", "PAN", "BANK_PROOF"] as const) {
    const doc = c.images[slot];
    if (!doc) continue;
    writeFileSync(specimenPath(c.id, slot), await toPhoto(doc, `${c.id}-${slot}`));
    count++;
  }
}
console.log(`Wrote ${count} SPECIMEN images to evals/specimens/`);

// The demo camera's sample photos: each persona's documents, clean and with each photo problem.
const demoDir = path.join(SPECIMEN_DIR, "demo");
mkdirSync(demoDir, { recursive: true });
let demoCount = 0;
for (const caseId of PERSONA_IDS) {
  const c = personaCase(caseId);
  if (!c) continue;
  for (const slot of ["DL", "PAN", "BANK_PROOF"] as const) {
    for (const variant of SHOT_VARIANTS) {
      const doc = shotDoc(c, slot, variant);
      if (!doc) continue;
      const id = shotId(caseId, slot, variant);
      writeFileSync(path.join(demoDir, `${id}.jpg`), await toPhoto(doc, id));
      demoCount++;
    }
  }
}
console.log(`Wrote ${demoCount} demo camera photos to evals/specimens/demo/`);

// The print sheet for the real-photo round (evals/specimens/phone-photos/README.md, D-038): eight
// cards at real ID-card size, 85.6 x 54 mm, on one A4 page. Print it at 100%, not "fit to page".
export const PRINT_CARDS = ["C01-DL", "C01-PAN", "C01-BANK_PROOF", "C02-BANK_PROOF", "C21-BANK_PROOF", "C26-DL", "C27-DL", "C31-DL"] as const;
const printDir = path.join(SPECIMEN_DIR, "print");
mkdirSync(printDir, { recursive: true });
for (const key of PRINT_CARDS) {
  const [id, slot] = [key.slice(0, 3), key.slice(4) as "DL" | "PAN" | "BANK_PROOF"];
  const doc = CASES.find((c) => c.id === id)?.images[slot];
  if (!doc) throw new Error(`No ${key} card to print`);
  // Twice the drawing's size, so the print is sharp at 85.6 mm wide.
  await sharp(Buffer.from(svgFor(doc)), { density: 144 }).png().toFile(path.join(printDir, `${key}.png`));
}
writeFileSync(
  path.join(printDir, "print-sheet.html"),
  `<!doctype html>
<meta charset="utf-8">
<title>SPECIMEN print sheet</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { margin: 0; font: 9pt Helvetica, Arial, sans-serif; color: #333; }
  h1 { font-size: 11pt; margin: 0 0 6mm; }
  .sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 7mm 10mm; }
  figure { margin: 0; }
  img { width: 85.6mm; height: 54mm; display: block; outline: 0.2mm dashed #999; }
  figcaption { margin-top: 1mm; }
</style>
<h1>SPECIMEN cards for the phone-photo round. Print at 100% scale. Made-up people: not real documents.</h1>
<div class="sheet">
${PRINT_CARDS.map((k) => `  <figure><img src="${k}.png" alt="${k}"><figcaption>${k}</figcaption></figure>`).join("\n")}
</div>
`,
);
console.log(`Wrote the print sheet (${PRINT_CARDS.length} cards) to evals/specimens/print/print-sheet.html`);
