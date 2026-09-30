import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neo4jFromEnv } from "../server/adapters/neo4j";
import { clearWorld, ensureSchema, Neo4jGraph } from "../server/adapters/neo4jGraph";
import type { Decision } from "../server/domain/types";
import { HOLDOUT_SUITE, MAIN_SUITE, runEvals } from "./harness";
import { naiveReader, oracleReader } from "./readers";

// Phase 5's proof (D-039), made the way the OPA switch was (D-030): every eval decision has to come
// out the same whether the trust graph is the in-memory one or Neo4j. It uses the Neo4j instance in
// .env and touches only its own eval worlds there, which it clears before and after.
// Usage: npm run graph:parity
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const db = neo4jFromEnv();
if (!db) {
  console.error("Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD (and NEO4J_DATABASE) in .env first.");
  process.exit(2);
}

const shape = (d: Decision) =>
  JSON.stringify({
    outcome: d.outcome,
    reasons: d.reasons.map((r) => ({ code: r.code, doc: r.doc, evidence: r.evidence })),
    passed: d.passed.map((p) => p.check),
    notices: d.notices.map((n) => n.code),
  });

const started = Date.now();
await ensureSchema(db);
let total = 0;
const differ: string[] = [];
for (const suite of [MAIN_SUITE, HOLDOUT_SUITE]) {
  const world = `eval-${suite.name}`;
  await clearWorld(db, world);
  for (const reader of [naiveReader, oracleReader]) {
    const inMemory = new Map<string, string>();
    const onNeo4j = new Map<string, string>();
    await runEvals(reader, { suite, onDecision: (id, d) => inMemory.set(id, shape(d)) });
    await runEvals(reader, { suite, graph: (drivers, banks) => new Neo4jGraph(db, world, drivers, banks), onDecision: (id, d) => onNeo4j.set(id, shape(d)) });
    for (const [id, a] of inMemory) {
      total++;
      if (onNeo4j.get(id) !== a) differ.push(`${suite.name} / ${reader.name} / ${id}\n    in memory: ${a}\n    Neo4j:     ${onNeo4j.get(id) ?? "no decision"}`);
    }
  }
  await clearWorld(db, world);
}

console.log(`Neo4j at ${db.host}: ${total - differ.length} of ${total} decisions identical to the in-memory graph (${((Date.now() - started) / 1000).toFixed(1)} s)`);
if (differ.length > 0) {
  console.log(differ.join("\n"));
  process.exit(1);
}
