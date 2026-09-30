import { FORGERIES } from "./config";

// The IDNet report (D-040), rebuilt from the saved rows at any time: npm run evals:idnet -- --report

export type IdnetRow = { folder: string; file: string; flagged: boolean | null; signs: string | null; docType: string; answeredBy: string; ms: number; error?: string };
export interface IdnetRun {
  reader: string;
  run: string; // ISO time
  spentUsd: number;
  abandoned?: number; // calls cut off mid-answer, not priced
  rows: IdnetRow[];
}

const LABEL: Record<string, string> = {
  positive: "Genuine",
  fraud1_copy_and_move: "Text copied over from another licence",
  fraud2_face_morphing: "Portrait morphed with another face",
  fraud3_face_replacement: "Portrait replaced",
  fraud4_combined: "Text and portrait both changed",
};
const FOLDERS = ["positive", ...FORGERIES];
const short = (model: string) => model.split("/").pop() ?? model;

export function summarise(rows: IdnetRow[]) {
  const genuineFlagged = new Set(rows.filter((r) => r.folder === "positive" && r.flagged).map((r) => r.file));
  const byType = FOLDERS.map((folder) => {
    const r = rows.filter((x) => x.folder === folder);
    const answered = r.filter((x) => x.flagged !== null);
    const flagged = answered.filter((x) => x.flagged);
    return {
      folder,
      label: LABEL[folder],
      n: r.length,
      answered: answered.length,
      flagged: flagged.length,
      // The paired test: the same licence, reported when forged but not when genuine. A report that
      // comes back on both copies is about the licence, not the edit.
      forgedOnly: folder === "positive" ? 0 : flagged.filter((x) => !genuineFlagged.has(x.file)).length,
    };
  });
  const forged = byType.slice(1);
  const models = [...new Set(rows.map((r) => r.answeredBy).filter(Boolean))].map((model) => {
    const r = rows.filter((x) => x.answeredBy === model);
    return {
      model,
      genuine: r.filter((x) => x.folder === "positive").length,
      genuineFlagged: r.filter((x) => x.folder === "positive" && x.flagged).length,
      forged: r.filter((x) => x.folder !== "positive").length,
      forgedFlagged: r.filter((x) => x.folder !== "positive" && x.flagged).length,
    };
  });
  return {
    byType,
    models,
    genuine: byType[0],
    caught: forged.reduce((s, x) => s + x.flagged, 0),
    forgedOnly: forged.reduce((s, x) => s + x.forgedOnly, 0),
    forgedN: forged.reduce((s, x) => s + x.n, 0),
    unanswered: byType.reduce((s, x) => s + x.n - x.answered, 0),
  };
}

export function renderReport(run: IdnetRun): string {
  const s = summarise(run.rows);
  const ms = run.rows.reduce((sum, x) => sum + x.ms, 0) / Math.max(1, run.rows.length);
  const reports = run.rows
    .filter((r) => r.flagged)
    .sort((a, b) => FOLDERS.indexOf(a.folder) - FOLDERS.indexOf(b.folder) || a.file.localeCompare(b.file));
  return [
    "# The IDNet round: can the reader tell a forged licence from a genuine one?",
    "",
    `Run ${run.run} · reader \`${run.reader}\` · ${run.rows.length} images from IDNet (synthetic South Dakota driving licences, CC0) · spent $${run.spentUsd.toFixed(4)}${run.abandoned ? ` (plus ${run.abandoned} call(s) cut off mid-answer, not priced)` : ""} · ${(ms / 1000).toFixed(1)} s an image`,
    "",
    `**Forgeries reported as edited: ${s.caught} of ${s.forgedN}, ${s.forgedOnly} of them on the forged copy only. Genuine licences wrongly reported: ${s.genuine.flagged} of ${s.genuine.n}.**${s.unanswered ? ` ${s.unanswered} image(s) unanswered.` : ""} A report sends the case to a person (policy v6); it never rejects anyone.`,
    "",
    "| Images | Reported as edited | Forged copy only | Unanswered |",
    "|---|---|---|---|",
    ...s.byType.map((t) => `| ${t.label} (${t.n}) | ${t.flagged} of ${t.answered} | ${t.folder === "positive" ? "—" : t.forgedOnly} | ${t.n - t.answered} |`),
    "",
    "Each forgery is a genuine licence in the sample, changed. \"Forged copy only\" counts a report on the forgery when the same licence's genuine copy wasn't reported: a report on both copies is about the licence, not the edit.",
    "",
    "| Read by | Genuine: reported | Forged: reported |",
    "|---|---|---|",
    ...s.models.map((m) => `| ${short(m.model)} | ${m.genuineFlagged} of ${m.genuine} | ${m.forgedFlagged} of ${m.forged} |`),
    "",
    "The app's reader is a chain: the fallback model reads only what the first was slow on or failed, so its row is a small, uneven sample.",
    "",
    "The licences aren't Indian, and the reader's prompt is written for Indian documents; what's measured here is only whether it notices editing.",
    "",
    "Every report:",
    "",
    ...reports.slice(0, 40).map((r) => `- ${LABEL[r.folder]}, ${r.file} (${short(r.answeredBy)}): "${r.signs}"`),
    ...(reports.length > 40 ? [`- …and ${reports.length - 40} more in IDNET.json`] : []),
    "",
  ].join("\n");
}
