import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type GraphFactory, inMemoryGraph } from "../server/adapters/graph";
import { SimulatedRegistry } from "../server/adapters/registry";
import { fixedClock } from "../server/domain/clock";
import type { BankRecord, Decision, DocReading, DocType, Driver, Outcome, ReasonCode, Submission } from "../server/domain/types";
import { POLICY_VERSION } from "../server/policy";
import { verifySubmission, type VerifyDeps } from "../server/verify";
import { BACKGROUND_DRIVERS, CASES, EVAL_NOW, VERIFIED_OWNER_IDS, type EvalCase } from "./cases";
import { HOLDOUT_BACKGROUND_DRIVERS, HOLDOUT_CASES, HOLDOUT_VERIFIED_OWNER_IDS } from "./holdout";
import { RunAbortedError, type EvalReader } from "./readers";

// A set of cases plus the world around them (drivers already on the platform, verified owners).
export interface EvalSuite {
  name: "main" | "holdout";
  cases: EvalCase[];
  background: { driver: Driver; bank: BankRecord }[];
  verifiedOwnerIds: ReadonlySet<string>;
}

// The main set is for building and tuning. The holdout was written separately, from the policy
// documents only, by someone who never saw the rules code. Don't tune against it: its numbers
// are the honest ones (FAILURES F-011). H12 and H13 did shape policy questions 1 and 2 (D-031).
export const MAIN_SUITE: EvalSuite = { name: "main", cases: CASES, background: BACKGROUND_DRIVERS, verifiedOwnerIds: VERIFIED_OWNER_IDS };
export const HOLDOUT_SUITE: EvalSuite = {
  name: "holdout",
  cases: HOLDOUT_CASES,
  background: HOLDOUT_BACKGROUND_DRIVERS,
  verifiedOwnerIds: HOLDOUT_VERIFIED_OWNER_IDS,
};

// The hard gate. Any model or prompt change has to keep passing this. Relative, so it means the
// same on the 10-good main set (at least 9 approved) as on a smaller holdout. A case the reader
// didn't answer (a timeout, a refused answer) proves nothing, so it fails the gate too (F-023):
// otherwise an error on a bad case would count as a bad case caught.
export const GATE = { maxBadApproved: 0, maxGoodMissed: 1, maxUnanswered: 0 } as const;

export function passesGate(s: { bad: number; badApproved: number; good: number; goodApproved: number; unanswered?: number }): boolean {
  return s.badApproved <= GATE.maxBadApproved && s.good - s.goodApproved <= GATE.maxGoodMissed && (s.unanswered ?? 0) <= GATE.maxUnanswered;
}

export const SPECIMEN_DIR = fileURLToPath(new URL("./specimens", import.meta.url));

export function specimenPath(caseId: string, slot: DocType, dir = SPECIMEN_DIR): string {
  return path.join(dir, `${caseId}-${slot}.jpg`);
}

// SIMULATED registries and a trust graph (in memory unless given one) over a suite's cases plus its background drivers.
export function buildWorld(suite: EvalSuite = MAIN_SUITE, graph: GraphFactory = inMemoryGraph): Omit<VerifyDeps, "clock"> {
  const { cases, background, verifiedOwnerIds } = suite;
  const drivers: Driver[] = [...cases.map((c) => c.driver), ...background.map((b) => b.driver)];
  const bankByDriver = Object.fromEntries([
    ...cases.map((c) => [c.driver.id, c.registry.bank] as const),
    ...background.map((b) => [b.driver.id, b.bank] as const),
  ]);
  const registry = new SimulatedRegistry({
    dl: cases.flatMap((c) => c.registry.dl),
    pan: cases.flatMap((c) => c.registry.pan),
    bankByDriver,
    faceByDriver: Object.fromEntries(cases.map((c) => [c.driver.id, c.registry.face])),
    digilocker: Object.fromEntries(cases.filter((c) => c.digilocker).map((c) => [c.driver.id, c.digilocker ?? {}])),
  });
  const byId = new Map(drivers.map((d) => [d.id, d]));
  return {
    registry,
    graph: graph(drivers, bankByDriver),
    findDriver: (id) => byId.get(id),
    isOwnerVerified: (id) => verifiedOwnerIds.has(id),
    priorFixReasons: () => [],
  };
}

export interface CaseResult {
  id: string;
  title: string;
  kind: "good" | "bad";
  expected: Outcome;
  got: Outcome | "ERROR";
  reasons: ReasonCode[];
  mustInclude: ReasonCode[];
  outcomeOk: boolean;
  reasonsOk: boolean;
  error?: string;
  ms: number;
}

export interface EvalSummary {
  suite: EvalSuite["name"];
  reader: string;
  readerKind: EvalReader["kind"];
  ranAt: string;
  rulesVersion: string;
  total: number;
  good: number;
  bad: number;
  goodApproved: number;
  badApproved: number;
  unanswered: number; // cases the reader errored on
  outcomeCorrect: number;
  reasonsCorrect: number;
  gatePassed: boolean;
  results: CaseResult[];
  // AI readers only: which model read the photos, and what that cost.
  // msPerRead is what the driver waits: for the app's reader, a slow primary's wait included.
  // abandoned: calls cut off mid-answer, which the provider may still bill; not in costUsd.
  model?: { id: string; answeredBy: string[]; reads: number; costUsd: number; msPerRead: number; fallbacks?: number; abandoned?: number };
}

export interface RunOptions {
  suite?: EvalSuite;
  imageDir?: string;
  onCase?: (r: CaseResult) => void;
  // Test hook: change each reading before the rules see it (e.g. drop fields).
  mutateReading?: (r: DocReading) => DocReading;
  // Test hook: see each full decision (the policy snapshot records them).
  onDecision?: (caseId: string, decision: Decision) => void;
  // The trust graph to decide with (in memory unless given; the Neo4j parity check passes its own).
  graph?: GraphFactory;
}

export async function runEvals(reader: EvalReader, opts: RunOptions = {}): Promise<EvalSummary> {
  const suite = opts.suite ?? MAIN_SUITE;
  const cases = suite.cases;
  if (cases.length === 0) throw new Error("No cases to run."); // an empty run would pass the gate
  const deps: VerifyDeps = { ...buildWorld(suite, opts.graph), clock: fixedClock(EVAL_NOW) };
  const results: CaseResult[] = [];

  if (reader.kind === "image") {
    const missing = cases.flatMap((c) =>
      (Object.keys(c.images) as DocType[]).map((slot) => specimenPath(c.id, slot, opts.imageDir)).filter((p) => !existsSync(p)),
    );
    if (missing.length > 0) throw new Error(`Missing ${missing.length} specimen images. Run: npm run specimens`);
  }

  for (const c of cases) {
    const started = Date.now();
    let result: CaseResult;
    try {
      const readings: Submission["readings"] = {};
      for (const slot of ["DL", "PAN", "BANK_PROOF"] as const) {
        const doc = c.images[slot];
        if (!doc) continue;
        const input = {
          caseId: c.id,
          slot,
          imagePath: specimenPath(c.id, slot, opts.imageDir),
          typedNumber: slot === "BANK_PROOF" ? undefined : (c.typed?.[slot] ?? doc.printed.number),
        };
        // Only reference readers see the answer key.
        const reading = reader.kind === "reference" ? await reader.read({ ...input, doc }) : await reader.read(input);
        readings[slot] = opts.mutateReading ? opts.mutateReading(reading) : reading;
      }
      const digilocker: Submission["digilocker"] = {};
      if (c.digilocker?.DL) digilocker.DL = true;
      if (c.digilocker?.PAN) digilocker.PAN = true;

      const decision = await verifySubmission({ driver: c.driver, readings, digilocker }, deps);
      opts.onDecision?.(c.id, decision);
      const codes = decision.reasons.map((r) => r.code);
      result = {
        id: c.id,
        title: c.title,
        kind: c.kind,
        expected: c.expected,
        got: decision.outcome,
        reasons: codes,
        mustInclude: c.mustInclude,
        outcomeOk: decision.outcome === c.expected,
        reasonsOk: c.mustInclude.every((m) => codes.includes(m)),
        ms: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof RunAbortedError) throw err;
      result = {
        id: c.id,
        title: c.title,
        kind: c.kind,
        expected: c.expected,
        got: "ERROR",
        reasons: [],
        mustInclude: c.mustInclude,
        outcomeOk: false,
        reasonsOk: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - started,
      };
    }
    results.push(result);
    opts.onCase?.(result);
  }

  const good = results.filter((r) => r.kind === "good");
  const bad = results.filter((r) => r.kind === "bad");
  const goodApproved = good.filter((r) => r.got === "APPROVE").length;
  const badApproved = bad.filter((r) => r.got === "APPROVE").length;
  const unanswered = results.filter((r) => r.got === "ERROR").length;

  return {
    suite: suite.name,
    reader: reader.name,
    readerKind: reader.kind,
    ranAt: new Date().toISOString(),
    rulesVersion: POLICY_VERSION,
    total: results.length,
    good: good.length,
    bad: bad.length,
    goodApproved,
    badApproved,
    unanswered,
    outcomeCorrect: results.filter((r) => r.outcomeOk).length,
    reasonsCorrect: bad.filter((r) => r.reasonsOk).length,
    gatePassed: passesGate({ bad: bad.length, badApproved, good: good.length, goodApproved, unanswered }),
    results,
  };
}

export function toMarkdown(s: EvalSummary): string {
  const upperBound = Math.min(100, Math.round((3 / Math.max(s.bad, 1)) * 100));
  const riskNote =
    s.badApproved > 0
      ? `${s.badApproved} bad case(s) got approved. The gate fails.`
      : s.unanswered > 0
        ? `${s.unanswered} case(s) went unanswered: the reader errored, so they prove nothing either way. The gate fails.`
        : `0 of ${s.bad} isn't zero risk: with ${s.bad} bad cases, the real miss rate could still be up to about ${upperBound}% (95% confidence, rule of three). More cases shrink that.`;
  const kindNote =
    s.readerKind === "reference"
      ? "Reference reader: built from the answer key, so it brackets real readers rather than competing with them."
      : s.model
        ? `AI reader \`${s.model.id}\` through OpenRouter; sees only the photo. ${s.model.reads} photos read for $${s.model.costUsd.toFixed(4)}, ${Math.round(s.model.msPerRead)} ms each on average${s.model.fallbacks ? `; the fallback model read ${s.model.fallbacks}` : ""}.${s.model.abandoned ? ` ${s.model.abandoned} call(s) cut off mid-answer aren't priced: the provider may still bill them.` : ""}`
        : "Image reader: sees only the photo.";

  return [
    `# Eval report: ${s.reader} reader, ${s.suite} set`,
    "",
    `Run ${s.ranAt} · rules ${s.rulesVersion} · ${s.total} cases (${s.good} good, ${s.bad} bad) · registry checks SIMULATED · SPECIMEN documents only`,
    "",
    kindNote,
    "",
    "| Check | Result | Gate |",
    "|---|---|---|",
    `| Bad cases approved | **${s.badApproved} of ${s.bad}** | must be ${GATE.maxBadApproved} |`,
    `| Good cases approved | **${s.goodApproved} of ${s.good}** | at least ${Math.max(0, s.good - GATE.maxGoodMissed)} |`,
    `| Unanswered (reader errors) | ${s.unanswered} of ${s.total} | must be ${GATE.maxUnanswered} |`,
    `| Right outcome | ${s.outcomeCorrect} of ${s.total} | — |`,
    `| Right reason (bad cases) | ${s.reasonsCorrect} of ${s.bad} | — |`,
    `| **Gate** | **${s.gatePassed ? "PASS" : "FAIL"}** | |`,
    "",
    riskNote,
    "",
    "| Case | Kind | Expected | Got | Reasons | OK |",
    "|---|---|---|---|---|---|",
    ...s.results.map(
      (r) =>
        `| ${r.id} ${r.title} | ${r.kind} | ${r.expected} | ${r.got} | ${r.reasons.join(", ") || "—"} | ${
          r.outcomeOk && r.reasonsOk ? "yes" : "**no**"
        } |`,
    ),
    "",
  ].join("\n");
}
