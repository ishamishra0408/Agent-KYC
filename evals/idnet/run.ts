import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_MODELS, APP_READER, createAiReader, createFallbackReader } from "../../server/adapters/aiReader";
import { createOpenRouter } from "../../server/adapters/openrouter";
import { FORGERIES, IDNET_DIR } from "./config";
import { type IdnetRow, type IdnetRun, renderReport, summarise } from "./report";

// The IDNet round (D-040): 30 synthetic South Dakota driving licences, each genuine and under four
// kinds of forgery, read by the app's reader. A forgery should come back with signs of editing; a
// genuine licence shouldn't. Usage: npm run evals:idnet -- [--reader=app|gemma|...] [--budget=0.5]
// --report rebuilds IDNET.md from IDNET.json without reading anything again.
function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const out = fileURLToPath(new URL("../results", import.meta.url));
if (process.argv.includes("--report")) {
  const saved = JSON.parse(readFileSync(path.join(out, "IDNET.json"), "utf8")) as IdnetRun;
  writeFileSync(path.join(out, "IDNET.md"), renderReport(saved));
  console.log("Rebuilt evals/results/IDNET.md from IDNET.json");
  process.exit(0);
}

const sampleFile = path.join(IDNET_DIR, "sample.json");
if (!existsSync(sampleFile)) {
  console.error("No IDNet sample yet. Run: npm run idnet:fetch");
  process.exit(2);
}
const sample = JSON.parse(readFileSync(sampleFile, "utf8")) as { licences: string[] };

const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY in .env first.");
  process.exit(2);
}
const readerName = arg("reader") ?? "app";
if (readerName !== "app" && !AI_MODELS[readerName]) {
  console.error(`Unknown reader ${readerName}. Readers: app, ${Object.keys(AI_MODELS).join(", ")}`);
  process.exit(2);
}
const budget = Number(arg("budget") ?? 0.5);
if (!Number.isFinite(budget) || budget <= 0) {
  console.error("--budget must be a positive number of US dollars.");
  process.exit(2);
}
const client = createOpenRouter({ apiKey, budgetUsd: budget });
const reader = readerName === "app" ? createFallbackReader(client, APP_READER) : createAiReader(client, AI_MODELS[readerName].id);

const jobs = ["positive", ...FORGERIES].flatMap((folder) => sample.licences.map((file) => ({ folder, file })));
const rows: IdnetRow[] = [];
// Three at a time: quicker than one by one, gentle enough on the providers' rate limits.
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { folder, file } = jobs[next++];
    const started = Date.now();
    try {
      // IDNet's files end in .png but hold JPEG data.
      const r = await reader.readImage(readFileSync(path.join(IDNET_DIR, folder, file)), "image/jpeg");
      rows.push({ folder, file, flagged: r.reading.tamperSigns != null, signs: r.reading.tamperSigns ?? null, docType: r.reading.docType, answeredBy: r.answeredBy, ms: Date.now() - started });
    } catch (err) {
      rows.push({ folder, file, flagged: null, signs: null, docType: "", answeredBy: "", ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
    }
    if (rows.length % 25 === 0) console.log(`${rows.length} of ${jobs.length} read`);
  }
}
await Promise.all([worker(), worker(), worker()]);

// A run where nothing was read (no credit, no network) must not replace the last real report.
if (rows.every((r) => r.flagged === null)) {
  console.error(`\nEvery image went unanswered (first error: ${rows[0]?.error ?? "none"}). Nothing written; the last report stays.`);
  process.exit(1);
}
const run: IdnetRun = { reader: readerName, run: new Date().toISOString(), spentUsd: client.spent().usd, abandoned: client.spent().abandoned, rows };
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "IDNET.md"), renderReport(run));
writeFileSync(path.join(out, "IDNET.json"), `${JSON.stringify(run, null, 2)}\n`);
const s = summarise(rows);
console.log(
  `\nForgeries reported: ${s.caught} of ${s.forgedN} (${s.forgedOnly} on the forged copy only) · genuine wrongly reported: ${s.genuine.flagged} of ${s.genuine.n} · $${run.spentUsd.toFixed(4)} · evals/results/IDNET.md`,
);
