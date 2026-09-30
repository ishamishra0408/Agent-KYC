import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The review for a policy change: which decisions changed between two policy snapshots, and how.
// npm run policy:diff -- tests/snapshots/policy-decisions.v2.json tests/snapshots/policy-decisions.json

type Shape = { outcome: string; reasons: { code: string }[]; passed: unknown[]; notices?: { code: string }[] };
export type Change = { key: string; changes: string[] };

export function diffSnapshots(before: Record<string, Shape>, after: Record<string, Shape>): Change[] {
  const codes = (s: Shape) => s.reasons.map((r) => r.code).join(", ") || "none";
  const out: Change[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (!a || !b) {
      out.push({ key, changes: [a ? "removed" : "added"] });
      continue;
    }
    const changes: string[] = [];
    if (a.outcome !== b.outcome) changes.push(`outcome ${a.outcome} -> ${b.outcome}`);
    if (codes(a) !== codes(b)) changes.push(`reasons ${codes(a)} -> ${codes(b)}`);
    else if (JSON.stringify(a.reasons) !== JSON.stringify(b.reasons)) changes.push("reason evidence changed");
    if (JSON.stringify(a.passed) !== JSON.stringify(b.passed)) changes.push("passed checks changed");
    if (JSON.stringify(a.notices ?? []) !== JSON.stringify(b.notices ?? [])) {
      changes.push(`notices ${(b.notices ?? []).map((n) => n.code).join(", ") || "none"}`);
    }
    out.push({ key, changes });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    console.error("Usage: npm run policy:diff -- <before.json> <after.json>");
    process.exit(1);
  }
  const before = JSON.parse(readFileSync(from, "utf8")) as Record<string, Shape>;
  const after = JSON.parse(readFileSync(to, "utf8")) as Record<string, Shape>;
  const changed = diffSnapshots(before, after);
  console.log(`${changed.length} of ${Object.keys(after).length} decisions changed.\n`);
  for (const c of changed) console.log(`- ${c.key}: ${c.changes.join("; ")}`);
}
