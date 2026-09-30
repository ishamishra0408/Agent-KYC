import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_MODELS, APP_READER, createAiReader, createFallbackReader } from "../server/adapters/aiReader";
import { createOpenRouter } from "../server/adapters/openrouter";
import { normalizeDocNumber } from "../server/adapters/registry";
import { readSpecimen } from "../server/ai/simulatedReader";
import type { DocReading, DocType, ReasonCode } from "../server/domain/types";
import { photoIssue, POLICY_VERSION } from "../server/policy";
import { CASES } from "./cases";
import { MAIN_SUITE, runEvals } from "./harness";
import { forSending } from "./phonePhoto";
import type { ImageReader } from "./readers";

// The real-photo round (D-038): phone photos of printed SPECIMEN cards, read by the app's reader.
// A clean shot has to pass the photo check and reach its case's decision, as the generated photo
// does; a bad shot has to be caught as the problem it is.
// Usage: npm run evals:phone -- [--reader=app|gemma|claude-sonnet|...] [--budget=0.5]
function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface Shot {
  file: string;
  case: string;
  slot: DocType;
  shot: string;
  expectIssue: ReasonCode | null;
}

const dir = fileURLToPath(new URL("./specimens/phone-photos", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { photos: Shot[] };
const shots = manifest.photos.filter((p) => existsSync(path.join(dir, p.file)));
if (shots.length === 0) {
  console.error("No phone photos yet. Take them as listed in evals/specimens/phone-photos/README.md, then run this again.");
  process.exit(2);
}

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
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

// Printed fields the reader should have copied, compared the way the rules compare them.
function fieldsRead(slot: DocType, printed: DocReading["fields"], got: DocReading["fields"]): { ok: number; of: number; wrong: string[] } {
  const same = (a?: string, b?: string) => (a ?? "").trim().toUpperCase() === (b ?? "").trim().toUpperCase();
  const keys = slot === "BANK_PROOF" ? (["holderName", "accountLast4", "ifsc"] as const) : (["name", "number", "dob"] as const);
  const wrong = keys.filter((k) => {
    if (!printed[k]) return false;
    return k === "number" ? normalizeDocNumber(printed[k] ?? "") !== normalizeDocNumber(got[k] ?? "") : !same(printed[k], got[k]);
  });
  const of = keys.filter((k) => printed[k]).length;
  return { ok: of - wrong.length, of, wrong: [...wrong] };
}

type Row = Shot & { got: ReasonCode | null | "ERROR"; decision: string; fields: string; answeredBy: string; ms: number; pass: boolean; note: string };
const rows: Row[] = [];
for (const shot of shots) {
  const c = CASES.find((x) => x.id === shot.case);
  const doc = c?.images[shot.slot];
  if (!c || !doc) throw new Error(`${shot.file}: no ${shot.case} ${shot.slot} in the eval set`);
  const started = Date.now();
  try {
    const r = await reader.readImage(await forSending(readFileSync(path.join(dir, shot.file))));
    const issue = photoIssue(r.reading, shot.slot);
    const f = fieldsRead(shot.slot, doc.printed, r.reading.fields);
    let decision = "";
    let pass = issue === shot.expectIssue;
    if (shot.expectIssue === null && issue === null) {
      // The photo stands in for the generated one; the case's other documents read perfectly.
      const one: ImageReader = { kind: "image", name: "phone", read: async ({ slot }) => (slot === shot.slot ? r.reading : readSpecimen(c.images[slot] ?? doc)) };
      const s = await runEvals(one, { suite: { ...MAIN_SUITE, cases: [c] } });
      decision = `${s.results[0].got} ${s.results[0].reasons.join(", ")}`.trim();
      pass = s.results[0].outcomeOk && s.results[0].reasonsOk;
    }
    const note = "fallback" in r && r.fallback ? `fallback: ${r.fallback}` : "";
    // Fields only mean something on a clean shot: a bad photo's fields aren't trusted anyway (D-012).
    const fields = shot.expectIssue === null ? `${f.ok} of ${f.of}${f.wrong.length ? ` (${f.wrong.join(", ")} misread)` : ""}` : "";
    rows.push({ ...shot, got: issue, decision, fields, answeredBy: r.answeredBy, ms: Date.now() - started, pass, note });
  } catch (err) {
    rows.push({ ...shot, got: "ERROR", decision: "", fields: "", answeredBy: "", ms: Date.now() - started, pass: false, note: err instanceof Error ? err.message : String(err) });
  }
  const row = rows[rows.length - 1];
  console.log(`${row.pass ? "ok  " : "MISS"} ${row.file.padEnd(28)} expected ${String(row.expectIssue ?? "clean").padEnd(14)} got ${String(row.got ?? "clean").padEnd(14)} ${row.decision}`);
}

const passed = rows.filter((r) => r.pass).length;
const missing = manifest.photos.length - shots.length;
const report = [
  "# The real-photo round: phone photos of printed SPECIMEN cards",
  "",
  `Run ${new Date().toISOString()} · reader \`${readerName}\` · rules ${POLICY_VERSION} · ${rows.length} photos${missing ? ` (${missing} from the list not taken yet)` : ""} · spent $${client.spent().usd.toFixed(4)}`,
  "",
  `**${passed} of ${rows.length} as expected.** A clean shot must pass the photo check and reach its case's decision; a bad shot must be caught as that problem.`,
  "",
  "| Photo | Shot | Expected | Photo check | Decision (clean shots) | Fields read | Read by | Time | OK |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.file} | ${r.shot} | ${r.expectIssue ?? "clean"} | ${r.got ?? "clean"} | ${r.decision || "—"} | ${r.fields || "—"} | ${r.answeredBy || r.note} | ${(r.ms / 1000).toFixed(1)} s | ${r.pass ? "yes" : "**no**"} |`,
  ),
  "",
].join("\n");
const out = fileURLToPath(new URL("./results", import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "PHONE.md"), report);
writeFileSync(path.join(out, "PHONE.json"), `${JSON.stringify({ reader: readerName, rulesVersion: POLICY_VERSION, rows }, null, 2)}\n`);
console.log(`\n${passed} of ${rows.length} as expected · $${client.spent().usd.toFixed(4)} · evals/results/PHONE.md`);
