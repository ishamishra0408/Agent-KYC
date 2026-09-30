import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Architecture rules, checked mechanically.
const SERVER = fileURLToPath(new URL("../server", import.meta.url));

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("module boundaries", () => {
  it("has AI code in the AI zone", () => {
    expect(filesUnder(path.join(SERVER, "ai")).length).toBeGreaterThan(0);
  });

  // An allowlist, not a denylist: AI code may use domain types and its own zone, nothing that can write.
  it("lets AI code import only domain types and its own zone (so it can't reach an approval)", () => {
    for (const file of filesUnder(path.join(SERVER, "ai"))) {
      for (const imp of importsOf(file)) {
        expect(imp, `${path.relative(SERVER, file)} imports ${imp}`).toMatch(/^(\.\.\/domain\/|\.\/)/);
      }
    }
  });

  it("creates the app's rules engines in one place only", () => {
    const creators = filesUnder(SERVER).filter((f) => /\bmakeRules\(/.test(readFileSync(f, "utf8")));
    expect(creators.map((f) => path.relative(SERVER, f)).sort()).toEqual(["domain/rules.ts", "policy/index.ts"]);
    const vehicle = filesUnder(SERVER).filter((f) => /\bmakeVehicleRules\(/.test(readFileSync(f, "utf8")));
    expect(vehicle.map((f) => path.relative(SERVER, f)).sort()).toEqual(["domain/vehicle.ts", "policy/index.ts"]);
  });

  it("keeps the domain pure: no database, services, adapters or AI", () => {
    for (const file of filesUnder(path.join(SERVER, "domain"))) {
      for (const imp of importsOf(file)) {
        expect(imp, `${path.relative(SERVER, file)} imports ${imp}`).toMatch(/^\.\//);
      }
    }
  });
});
