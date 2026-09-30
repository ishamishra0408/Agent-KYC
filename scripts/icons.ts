import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// The site's icons as real files (F-027), all from public/favicon.svg: a 32 px PNG, a favicon.ico for
// browsers that ask for it by name, and a 180 px apple-touch-icon on the page's ground (it must be
// opaque). index.html links them with a version, so a new mark gets a new URL. Usage: npm run icons
const root = fileURLToPath(new URL("..", import.meta.url));
const pub = (name: string) => path.join(root, "public", name);
const svg = readFileSync(pub("favicon.svg"));
const BG = "#e9ebf2"; // the light theme's --bg

const png32 = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer();
writeFileSync(pub("favicon-32.png"), png32);

// A one-image .ico that wraps the PNG (browsers have read PNG inside .ico for years).
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header.writeUInt8(32, 6); // width
header.writeUInt8(32, 7); // height
header.writeUInt8(0, 8); // no palette
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png32.length, 14); // image size
header.writeUInt32LE(22, 18); // image offset
writeFileSync(pub("favicon.ico"), Buffer.concat([header, png32]));

const mark = await sharp(svg, { density: 1200 }).resize(132, 132).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: BG } })
  .composite([{ input: mark, left: 24, top: 22 }])
  .png()
  .toFile(pub("apple-touch-icon.png"));
console.log("public/favicon-32.png, public/favicon.ico, public/apple-touch-icon.png");
