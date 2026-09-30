import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// The OPA CLI: $OPA_BIN if set, else the project-local tools/opa, else `opa` on the PATH.
// Only needed to compile the policy and run its tests; the app runs the compiled policy.
export function opaBinary(): string {
  if (process.env.OPA_BIN) return process.env.OPA_BIN;
  const local = fileURLToPath(new URL("../tools/opa", import.meta.url));
  return existsSync(local) ? local : "opa";
}

// `tsx scripts/opa.ts <args>` runs the CLI with those arguments.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = spawnSync(opaBinary(), process.argv.slice(2), { stdio: "inherit" });
  if (run.error) {
    console.error(`Couldn't run OPA (${run.error.message}). Install it, or set OPA_BIN: https://www.openpolicyagent.org/docs#running-opa`);
    process.exit(1);
  }
  process.exit(run.status ?? 1);
}
