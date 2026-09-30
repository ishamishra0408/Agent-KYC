import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_MODELS, createAiReader } from "../server/adapters/aiReader";
import { createOpenRouter } from "../server/adapters/openrouter";
import { POLICY_VERSION } from "../server/policy";
import { HOLDOUT_SUITE, MAIN_SUITE, runEvals, toMarkdown, type EvalSummary } from "./harness";
import { aiReader, RunAbortedError } from "./readers";

// The model comparison (D-035): every AI reader on both sets, through the same policy and gate,
// with cost and speed. One command, one table: evals/results/BAKEOFF.md.
// Usage: npm run evals:bakeoff -- [--models=claude-opus,claude-sonnet,claude-haiku,qwen,gemma] [--budget=6]
function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY in .env first.");
  process.exit(2);
}

const models = (arg("models") ?? "claude-opus,claude-sonnet,claude-haiku,qwen,gemma").split(",").map((m) => m.trim());
const unknown = models.filter((m) => !AI_MODELS[m]);
if (unknown.length > 0) {
  console.error(`Unknown models: ${unknown.join(", ")}. Known: ${Object.keys(AI_MODELS).join(", ")}`);
  process.exit(2);
}
// One budget for the whole comparison, shared by every model.
const budget = Number(arg("budget") ?? 6);
if (!Number.isFinite(budget) || budget <= 0) {
  console.error("--budget must be a positive number of US dollars.");
  process.exit(2);
}
const client = createOpenRouter({ apiKey, budgetUsd: budget });
const outDir = fileURLToPath(new URL("./results", import.meta.url));
mkdirSync(outDir, { recursive: true });

// The models run side by side, each through both sets in turn. They share the budget; each one's cost
// is added up from its own answers, so running together doesn't blur who spent what.
async function compare(key: string): Promise<string> {
  const preset = AI_MODELS[key];
  const per: Partial<Record<"main" | "holdout", EvalSummary>> = {};
  try {
    for (const suite of [MAIN_SUITE, HOLDOUT_SUITE]) {
      const ai = aiReader(key, createAiReader(client, preset.id));
      console.log(`${preset.label} on ${suite.name}…`);
      const s = await runEvals(ai.reader, { suite });
      const reads = ai.readings.length;
      s.model = {
        id: preset.id,
        answeredBy: [...new Set(ai.readings.map((r) => r.answeredBy))],
        reads,
        costUsd: ai.readings.reduce((sum, r) => sum + r.usage.costUsd, 0),
        msPerRead: reads ? ai.readings.reduce((sum, r) => sum + r.ms, 0) / reads : 0,
      };
      const file = suite.name === "main" ? key : `${suite.name}-${key}`;
      writeFileSync(path.join(outDir, `${file}.md`), toMarkdown(s));
      writeFileSync(path.join(outDir, `${file}.json`), `${JSON.stringify(s, null, 2)}\n`);
      per[suite.name as "main" | "holdout"] = s;
      console.log(`${preset.label} on ${suite.name}: bad approved ${s.badApproved}/${s.bad} · good approved ${s.goodApproved}/${s.good} · unanswered ${s.unanswered}`);
    }
  } catch (err) {
    if (!(err instanceof RunAbortedError)) throw err;
    if (err.reason === "budget") return `| ${preset.label} | stopped: budget reached | | | | | |`;
    console.error(`${preset.label}: ${err.message} No comparison table written.`);
    process.exit(1);
  }
  const m = per.main!;
  const h = per.holdout!;
  const errors = m.unanswered + h.unanswered;
  const reads = m.model!.reads + h.model!.reads;
  const cost = reads ? `$${(((m.model!.costUsd + h.model!.costUsd) / reads) * 1000).toFixed(2)} per 1,000 photos` : "no photos read";
  const seconds = reads ? (m.model!.msPerRead * m.model!.reads + h.model!.msPerRead * h.model!.reads) / reads / 1000 : 0;
  return `| ${preset.label} | ${m.badApproved} of ${m.bad} | ${h.badApproved} of ${h.bad} | ${m.goodApproved + h.goodApproved} of ${m.good + h.good} | ${
    m.gatePassed && h.gatePassed ? "**PASS**" : "FAIL"
  } | ${cost} · ${seconds.toFixed(1)} s each | ${errors} |`;
}

const rows = await Promise.all(models.map(compare));

const table = [
  "# Model comparison: the document reader",
  "",
  `Run ${new Date().toISOString()} through OpenRouter. Same photos, same policy (rules ${POLICY_VERSION}), same gate: no bad case approved, at most one good case missed, no case unanswered. Total spent: $${client
    .spent()
    .usd.toFixed(2)}.`,
  "",
  "| Reader | Main: bad approved | Holdout: bad approved | Good approved (both sets) | Gate | Cost and speed | Errors |",
  "|---|---|---|---|---|---|---|",
  ...rows,
  "",
  baselines(),
  "",
].join("\n");
// A run on chosen models gets its own table, so it never replaces the full comparison.
const tableFile = arg("models") ? `BAKEOFF-${models.join("+")}.md` : "BAKEOFF.md";
writeFileSync(path.join(outDir, tableFile), table);
console.log(`\n${table}`);

// The reference points, from their last saved runs.
function baselines(): string {
  const read = (name: string) => {
    const file = path.join(outDir, `${name}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as EvalSummary) : null;
  };
  const parts = [
    ["no reading", read("naive")],
    ["plain image checks", read("heuristic")],
    ["perfect reading", read("oracle")],
  ].flatMap(([label, s]) => (s && typeof s === "object" ? [`${label as string} approves ${s.badApproved} of ${s.bad} bad`] : []));
  return parts.length > 0 ? `Baselines on the main set's photos: ${parts.join("; ")}.` : "";
}
