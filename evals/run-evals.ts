import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_MODELS, APP_READER, createAiReader, createFallbackReader } from "../server/adapters/aiReader";
import { createOpenRouter } from "../server/adapters/openrouter";
import { HOLDOUT_SUITE, MAIN_SUITE, runEvals, toMarkdown, type EvalSuite, type EvalSummary } from "./harness";
import { aiReader, heuristicReader, naiveReader, oracleReader, RunAbortedError, type EvalReader } from "./readers";

// Usage: npm run evals -- --reader=<name> [--suite=main|holdout] [--strict]
//   reference and image readers: naive, heuristic, oracle
//   AI readers (Phase 3, through OpenRouter; they spend credit): claude-opus, claude-sonnet, claude-haiku, qwen, gemma, qwen-free,
//     and app: the app's own reader (Gemma 4 31B, then Claude Sonnet if Gemma is slow or fails, D-038)
//     [--budget=2]                 stop before spending more than this many US dollars (default 2)
//     [--cases=C01,C27]            only these cases: a smoke test, not a result (nothing is written)
//     [--allow-data-collection]    allow providers that may store prompts (free models need it; SPECIMEN documents only)
const READERS: Record<string, EvalReader> = { naive: naiveReader, heuristic: heuristicReader, oracle: oracleReader };
const SUITES: Record<string, EvalSuite> = { main: MAIN_SUITE, holdout: HOLDOUT_SUITE };

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const readerName = arg("reader") ?? "oracle";
const baseSuite = SUITES[arg("suite") ?? "main"];
const APP = { id: `${APP_READER.primary}, then ${APP_READER.fallback}`, label: "App reader (Gemma 4 31B, Sonnet fallback)" };
const preset = readerName === "app" ? APP : AI_MODELS[readerName];
if ((!READERS[readerName] && !preset) || !baseSuite) {
  console.error(
    `Unknown reader or suite. Readers: ${[...Object.keys(READERS), ...Object.keys(AI_MODELS)].join(", ")}. Suites: ${Object.keys(SUITES).join(", ")}.`,
  );
  process.exit(2);
}

const only = arg("cases")?.split(",").map((c) => c.trim().toUpperCase());
const suite: EvalSuite = only ? { ...baseSuite, cases: baseSuite.cases.filter((c) => only.includes(c.id)) } : baseSuite;
if (suite.cases.length === 0) {
  console.error(`No ${baseSuite.name} case matches --cases=${arg("cases")}.`);
  process.exit(2);
}
const budget = Number(arg("budget") ?? 2);
if (!Number.isFinite(budget) || budget <= 0) {
  console.error("--budget must be a positive number of US dollars.");
  process.exit(2);
}

let reader: EvalReader = READERS[readerName];
let ai: ReturnType<typeof aiReader> | undefined;
let spent = () => ({ usd: 0, calls: 0, abandoned: 0 });
if (preset) {
  const envFile = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Set OPENROUTER_API_KEY in .env first.");
    process.exit(2);
  }
  const client = createOpenRouter({
    apiKey,
    budgetUsd: budget,
    dataCollection: process.argv.includes("--allow-data-collection") ? "allow" : "deny",
  });
  ai = aiReader(readerName, readerName === "app" ? createFallbackReader(client, APP_READER) : createAiReader(client, preset.id));
  reader = ai.reader;
  spent = client.spent;
  console.log(`${preset.label} (${preset.id}) on the ${suite.name} set, ${suite.cases.length} cases, budget $${budget}`);
}

let summary: EvalSummary;
try {
  summary = await runEvals(reader, {
    suite,
    onCase: (r) =>
      console.log(
        `${r.outcomeOk && r.reasonsOk ? "ok  " : "MISS"} ${r.id} ${r.expected.padEnd(9)} -> ${r.got.padEnd(9)} ${r.error ? `ERROR ${r.error}` : r.reasons.join(", ")}`,
      ),
  });
} catch (err) {
  if (!(err instanceof RunAbortedError)) throw err;
  console.error(`\nStopped: ${err.message} Nothing written.`);
  process.exit(1);
}

if (ai && preset) {
  const reads = ai.readings.length;
  summary.model = {
    id: preset.id,
    answeredBy: [...new Set(ai.readings.map((r) => r.answeredBy))],
    reads,
    costUsd: spent().usd,
    msPerRead: reads ? ai.readings.reduce((sum, r) => sum + r.ms, 0) / reads : 0,
    fallbacks: ai.readings.filter((r) => "fallback" in r && r.fallback).length,
    abandoned: spent().abandoned,
  };
  console.log(`\n${reads} photos read · $${spent().usd.toFixed(4)} · ${Math.round(summary.model.msPerRead)} ms per photo`);
}

const errors = summary.unanswered;
console.log(
  only
    ? `\n${reader.name}: ${summary.outcomeCorrect} of ${summary.total} as expected${errors ? `, ${errors} errors` : ""} (a smoke test, not a gate result)`
    : `\n${reader.name} on ${suite.name}: bad approved ${summary.badApproved}/${summary.bad} · good approved ${summary.goodApproved}/${summary.good} · gate ${summary.gatePassed ? "PASS" : "FAIL"}${errors ? ` · ${errors} errors` : ""}`,
);

if (only) {
  console.log("Smoke test on chosen cases: nothing written to evals/results.");
} else {
  const outDir = fileURLToPath(new URL("./results", import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const file = suite.name === "main" ? reader.name : `${suite.name}-${reader.name}`;
  writeFileSync(path.join(outDir, `${file}.md`), toMarkdown(summary));
  writeFileSync(path.join(outDir, `${file}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Report: evals/results/${file}.md`);
}

if (process.argv.includes("--strict") && !summary.gatePassed) process.exit(1);
