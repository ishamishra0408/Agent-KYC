import { CASES } from "./cases";
import { specimenPath } from "./harness";
import { photoStats } from "./photoStats";

// Prints the measurements behind the heuristic reader's thresholds: npx tsx evals/photo-stats.ts
console.log("image            defect    size       brightness  sharpness  blown-out");
for (const c of CASES) {
  for (const slot of ["DL", "PAN", "BANK_PROOF"] as const) {
    const doc = c.images[slot];
    if (!doc) continue;
    const s = await photoStats(specimenPath(c.id, slot));
    console.log(
      `${c.id}-${slot}`.padEnd(17) +
        (doc.defect ?? "-").padEnd(10) +
        `${s.width}x${s.height}`.padEnd(11) +
        s.brightness.toFixed(0).padEnd(12) +
        s.sharpness.toFixed(2).padEnd(11) +
        `${(s.blownOut * 100).toFixed(1)}%`,
    );
  }
}
