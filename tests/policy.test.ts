import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTRYPOINTS, policySources, sha256 } from "../scripts/build-policy";
import { REASONS } from "../server/domain/reasons";
import { loadOpaEngine, POLICY_WASM } from "../server/policy/opa";
import { rules } from "../server/policy";

// The compiled policy the app runs must be the Rego in policy/, and the policy and the app's reason
// catalogue must agree on every code. Rego unit tests run separately: `npm run policy:test`.
const POLICY_DIR = fileURLToPath(new URL("../policy", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(POLICY_DIR, "build/manifest.json"), "utf8")) as {
  entrypoints: string[];
  sources: Record<string, string>;
  wasm: string;
};

describe("compiled policy", () => {
  it("was built from the Rego that's in policy/ now (else run: npm run policy:build)", () => {
    const current = Object.fromEntries(policySources().map((f) => [f, sha256(path.join(POLICY_DIR, f))]));
    expect(manifest.sources).toEqual(current);
    expect(sha256(POLICY_WASM)).toBe(manifest.wasm);
    expect(manifest.entrypoints).toEqual(ENTRYPOINTS);
  });

  it("agrees with the reason catalogue on every code and its severity", () => {
    const fromPolicy = loadOpaEngine().evaluate("kyc/severities", {});
    const fromCatalogue = Object.fromEntries(Object.entries(REASONS).map(([code, info]) => [code, info.severity]));
    expect(fromPolicy).toEqual(fromCatalogue);
  });

  it("is version v7: v3 settled the eight open questions, v4 the ninth, v5 a trust graph that can't answer, v6 an edited document, v7 instructions in a field", () => {
    expect(rules.version).toBe("v7");
  });

  it("applies the licence window from the policy: renewal inside 30 days, lapsed the day after the last", () => {
    expect([-1, 0, 30, 31, null].map((d) => rules.licenceWindow(d))).toEqual([
      { due: false, expired: true },
      { due: true, expired: false },
      { due: true, expired: false },
      { due: false, expired: false },
      { due: false, expired: false },
    ]);
  });
});
