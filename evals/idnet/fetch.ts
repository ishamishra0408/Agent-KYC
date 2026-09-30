import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { FORGERIES, IDNET_DIR, IDNET_URL, SAMPLE_SIZE } from "./config";

// Fetches the IDNet sample (config.ts). The archive is 4.87 GB; this reads its table of contents and
// fetches only the chosen images with HTTP range requests, about 17 MB. Usage: npm run idnet:fetch

interface Entry {
  name: string;
  method: number;
  csize: number;
  offset: number;
}

// Zenodo turns away requests that don't say who they are.
const HEADERS = { "User-Agent": "agent-kycready-evals/1.0 (IDNet sample)" };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One byte range. Zenodo limits how fast it answers, so a "slow down" is waited out, not fatal.
async function range(start: number, end: number): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(IDNET_URL, { headers: { ...HEADERS, Range: `bytes=${start}-${end}` } });
    if (res.status === 206) return Buffer.from(await res.arrayBuffer());
    if ((res.status === 429 || res.status === 503) && attempt < 6) {
      const asked = Number(res.headers.get("retry-after"));
      await pause(Number.isFinite(asked) && asked > 0 ? asked * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`Zenodo didn't serve a range (HTTP ${res.status})`);
  }
}

// The ZIP's central directory: where every file starts and how big it is (ZIP64, since > 4 GB).
async function centralDirectory(): Promise<Entry[]> {
  const head = await fetch(IDNET_URL, { method: "HEAD", headers: HEADERS });
  const size = Number(head.headers.get("content-length"));
  const tail = await range(size - 131_072, size - 1);
  const locator = tail.lastIndexOf(Buffer.from("PK\x06\x07", "latin1"));
  if (locator < 0) throw new Error("not a ZIP64 archive");
  const z64 = await range(Number(tail.readBigUInt64LE(locator + 8)), Number(tail.readBigUInt64LE(locator + 8)) + 55);
  const cdSize = Number(z64.readBigUInt64LE(40));
  const cdOffset = Number(z64.readBigUInt64LE(48));
  const cd = await range(cdOffset, cdOffset + cdSize - 1);
  const entries: Entry[] = [];
  for (let i = 0; i < cd.length && cd.readUInt32LE(i) === 0x02014b50; ) {
    const method = cd.readUInt16LE(i + 10);
    let csize = cd.readUInt32LE(i + 20);
    const usize = cd.readUInt32LE(i + 24);
    const [nlen, xlen, clen] = [cd.readUInt16LE(i + 28), cd.readUInt16LE(i + 30), cd.readUInt16LE(i + 32)];
    let offset = cd.readUInt32LE(i + 42);
    const name = cd.subarray(i + 46, i + 46 + nlen).toString("utf8");
    // ZIP64 extra field: the sizes and offset that didn't fit in 32 bits, in this order.
    const extra = cd.subarray(i + 46 + nlen, i + 46 + nlen + xlen);
    for (let j = 0; j + 4 <= extra.length; j += 4 + extra.readUInt16LE(j + 2)) {
      if (extra.readUInt16LE(j) !== 1) continue;
      let k = j + 4;
      if (usize === 0xffffffff) k += 8;
      if (csize === 0xffffffff) {
        csize = Number(extra.readBigUInt64LE(k));
        k += 8;
      }
      if (offset === 0xffffffff) offset = Number(extra.readBigUInt64LE(k));
    }
    entries.push({ name, method, csize, offset });
    i += 46 + nlen + xlen + clen;
  }
  return entries;
}

// One request per file: the local header plus room for its extra field, then the data.
async function extract(e: Entry): Promise<Buffer> {
  const slack = 30 + Buffer.byteLength(e.name) + 512;
  const buf = await range(e.offset, e.offset + slack + e.csize - 1);
  const start = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
  const data = buf.subarray(start, start + e.csize);
  return e.method === 8 ? inflateRawSync(data) : data;
}

const entries = await centralDirectory();
const byName = new Map(entries.map((e) => [e.name, e]));
// The same licences every time: every nth genuine licence, by file name.
const genuine = entries
  .filter((e) => e.name.startsWith("SD/positive/") && e.name.endsWith(".png"))
  .map((e) => path.basename(e.name))
  .sort();
const step = Math.floor(genuine.length / SAMPLE_SIZE);
const chosen = genuine.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);

let bytes = 0;
for (const folder of ["positive", ...FORGERIES]) {
  mkdirSync(path.join(IDNET_DIR, folder), { recursive: true });
  for (const file of chosen) {
    const e = byName.get(`SD/${folder}/${file}`);
    if (!e) throw new Error(`SD/${folder}/${file} is missing from the archive`);
    const out = path.join(IDNET_DIR, folder, file);
    if (existsSync(out)) continue; // already fetched: the sample is the same every time
    writeFileSync(out, await extract(e));
    bytes += e.csize;
    await pause(300);
  }
  console.log(`${folder}: ${chosen.length} images`);
}
writeFileSync(path.join(IDNET_DIR, "sample.json"), `${JSON.stringify({ source: IDNET_URL, license: "CC0-1.0", licences: chosen, forgeries: FORGERIES }, null, 2)}\n`);
console.log(`Fetched ${chosen.length * (1 + FORGERIES.length)} images (${(bytes / 1e6).toFixed(1)} MB) into evals/idnet/SD/`);
