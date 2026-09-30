import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { opaBinary } from "./opa";

// Compiles the policy (policy/*.rego, tests excluded) to WebAssembly, and records exactly what it
// was built from. tests/policy.test.ts fails if the Rego changes without a rebuild.
// The compiled file is kept in the repo, so the app and its tests run without the OPA CLI.

const POLICY_DIR = fileURLToPath(new URL("../policy", import.meta.url));
const OUT_DIR = path.join(POLICY_DIR, "build");
export const ENTRYPOINTS = ["kyc/decision", "kyc/photo_check", "kyc/renewal", "kyc/severities", "kyc/version"];

export const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

export function policySources(): string[] {
  return readdirSync(POLICY_DIR)
    .filter((f) => f.endsWith(".rego") && !f.endsWith("_test.rego"))
    .sort();
}

function build(): void {
  const opa = opaBinary();
  const tmp = mkdtempSync(path.join(tmpdir(), "kyc-policy-"));
  try {
    const bundle = path.join(tmp, "bundle.tar.gz");
    const sources = policySources();
    // Relative file names, run from policy/: the compiled file then carries no local path and
    // rebuilds byte-identical anywhere.
    execFileSync(opa, ["build", "-t", "wasm", ...ENTRYPOINTS.flatMap((e) => ["-e", e]), "-o", bundle, ...sources], {
      cwd: POLICY_DIR,
      stdio: "inherit",
    });
    execFileSync("tar", ["-xzf", bundle, "-C", tmp]);
    mkdirSync(OUT_DIR, { recursive: true });
    const wasm = path.join(OUT_DIR, "kyc.wasm");
    copyFileSync(path.join(tmp, "policy.wasm"), wasm);
    chmodSync(wasm, 0o644);

    const opaVersion = execFileSync(opa, ["version"], { encoding: "utf8" }).match(/^Version: (.+)$/m)?.[1] ?? "unknown";
    const manifest = {
      note: "Written by `npm run policy:build`. Don't edit.",
      opa: opaVersion,
      entrypoints: ENTRYPOINTS,
      sources: Object.fromEntries(sources.map((f) => [f, sha256(path.join(POLICY_DIR, f))])),
      wasm: sha256(wasm),
    };
    writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Built policy/build/kyc.wasm from ${sources.join(", ")} with OPA ${opaVersion}.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) build();
