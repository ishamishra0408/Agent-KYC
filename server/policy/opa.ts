import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type * as OpaWasm from "@open-policy-agent/opa-wasm";
import type { PolicyEngine, PolicyEntrypoint } from "../domain/rules";

// The SDK's ES module build only exports the async loader; its CommonJS build has the sync one.
const { loadPolicySync } = createRequire(import.meta.url)("@open-policy-agent/opa-wasm") as typeof OpaWasm;

// The KYC policy, compiled from policy/kyc.rego to WebAssembly by `npm run policy:build`.
// It runs in-process: no policy server, and the tests stay offline.
export const POLICY_WASM = fileURLToPath(new URL("../../policy/build/kyc.wasm", import.meta.url));

export function loadOpaEngine(wasmPath = POLICY_WASM): PolicyEngine {
  const policy = loadPolicySync(readFileSync(wasmPath));
  return {
    evaluate(entrypoint: PolicyEntrypoint, input: unknown): unknown {
      const results: unknown = policy.evaluate(input, entrypoint);
      if (!Array.isArray(results) || results.length !== 1) {
        throw new Error(`The policy gave no single answer for ${entrypoint}. Was it built with that entry point?`);
      }
      return (results[0] as { result?: unknown }).result;
    },
  };
}
