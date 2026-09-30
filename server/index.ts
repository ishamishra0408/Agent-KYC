import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_READER, createFallbackReader } from "./adapters/aiReader";
import { createOpenRouter } from "./adapters/openrouter";
import { aiPhotoReader, type PhotoReader, simulatedPhotoReader } from "./adapters/photoReader";
import type { GraphFactory } from "./adapters/graph";
import { neo4jFromEnv } from "./adapters/neo4j";
import { clearWorld, ensureSchema, Neo4jGraph } from "./adapters/neo4jGraph";
import { createApp } from "./api/app";
import { Store } from "./db/store";
import { seedDemo } from "./demo/seed";
import { createWorld } from "./demo/world";
import { ManualClock } from "./domain/clock";
import { istAt } from "./domain/time";
import type { KycContext } from "./services/kyc";

// API_PORT, not PORT: dev launchers often set PORT for the web server, and the two must differ.
const PORT = Number(process.env.API_PORT ?? 3101);
const root = fileURLToPath(new URL("..", import.meta.url));
const specimenDir = path.join(root, "evals", "specimens");
const resultsDir = path.join(root, "evals", "results");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Who reads a photo taken in the demo (D-038): Gemma 4 31B, then Claude Sonnet if Gemma is slow or
// fails, when an OpenRouter key is set; READER=simulated keeps the stand-in. Spend stops at
// READER_BUDGET_USD for the life of the server.
function liveReader(): PhotoReader {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.READER === "simulated" || !apiKey) {
    console.log("Photos are read by the simulated reader.");
    return simulatedPhotoReader;
  }
  const budgetUsd = Number(process.env.READER_BUDGET_USD ?? 1);
  const timeoutMs = Number(process.env.READER_TIMEOUT_MS ?? APP_READER.timeoutMs);
  const client = createOpenRouter({ apiKey, budgetUsd: Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : 1 });
  console.log(`Photos are read by ${APP_READER.primary}, then ${APP_READER.fallback} if it's slow or fails.`);
  return aiPhotoReader(createFallbackReader(client, { ...APP_READER, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : APP_READER.timeoutMs }), path.join(specimenDir, "demo"));
}
const reader = liveReader();

// The trust graph (D-039): Neo4j when .env has an instance (GRAPH=memory keeps the in-memory one).
// If Neo4j can't answer a check, the case goes to a person (policy v5), so a paused instance is
// safe, just slow to decide.
const neo4j = process.env.GRAPH === "memory" ? null : neo4jFromEnv();
const DEMO_WORLD = "demo";
const liveGraph: GraphFactory | undefined = neo4j ? (drivers, banks) => new Neo4jGraph(neo4j, DEMO_WORLD, drivers, banks) : undefined;
if (neo4j) {
  try {
    await neo4j.run("RETURN 1");
    await ensureSchema(neo4j);
    console.log(`Trust graph: Neo4j at ${neo4j.host}.`);
  } catch (err) {
    console.warn(`Trust graph: Neo4j isn't answering (${err instanceof Error ? err.message : String(err)}). Cases will go to a person until it does.`);
  }
} else {
  console.log("Trust graph: in memory.");
}

// The demo runs on its own clock (Tue 29 Sep 2026, 10 AM IST) so nudge timing can be shown by
// moving time forward. State lives in memory and is re-seeded on every start or reset.
export const DEMO_START = istAt(2026, 8, 29, 10);

const ctx: KycContext = { store: new Store(), clock: new ManualClock(DEMO_START), world: createWorld() };

async function reset(): Promise<void> {
  ctx.store = new Store();
  ctx.clock = new ManualClock(DEMO_START);
  ctx.world = createWorld(); // the simulated registries start over too (e.g. a renewed licence)
  // The seeded cast is read by the stand-in and decided with the in-memory graph, so starting or
  // resetting the demo calls no model and doesn't depend on Neo4j (the graph parity check shows
  // the two graphs decide alike). Everything done in the demo afterwards uses the live ones.
  ctx.reader = simulatedPhotoReader;
  ctx.graph = undefined;
  await seedDemo(ctx);
  if (neo4j) await clearWorld(neo4j, DEMO_WORLD).catch(() => undefined); // rebuilt at the next check
  ctx.reader = reader;
  ctx.graph = liveGraph;
  ctx.graphName = neo4j ? "Neo4j" : undefined;
}

await reset();

if (!existsSync(path.join(specimenDir, "demo"))) {
  console.warn("Demo photos are missing. Run: npm run specimens");
}

// A local demo with no authentication: the ops routes can decide cases, so the API only
// listens on this machine.
createApp({ ctx, specimenDir, resultsDir, reset }).listen(PORT, "127.0.0.1", () => {
  console.log(`Agent KYCReady API on http://127.0.0.1:${PORT} (local demo, no auth)`);
});
