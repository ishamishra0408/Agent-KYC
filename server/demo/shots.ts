import { CASES, type EvalCase } from "../../evals/cases";
import { PHOTO_DEFECTS, type SpecimenDefect, type SpecimenLike } from "../ai/simulatedReader";
import type { DocType } from "../domain/types";

// The demo cast: eval cases picked so every path shows up once.
export const PERSONA_IDS = ["C01", "C11", "C10", "C07", "C08", "C06", "C22", "C21", "C14", "C27"] as const;

// The demo camera offers these sample photos for each document. All SPECIMEN.
export const SHOT_VARIANTS = ["clean", "blurry", "glare", "screen"] as const;
export type ShotVariant = (typeof SHOT_VARIANTS)[number];

export function personaCase(caseId: string): EvalCase | undefined {
  return CASES.find((c) => c.id === caseId);
}

export function caseForDriver(driverId: string): EvalCase | undefined {
  return CASES.find((c) => c.driver.id === driverId);
}

export function shotId(caseId: string, slot: DocType, variant: ShotVariant): string {
  return `${caseId}-${slot}-${variant}`;
}

// The document as printed, even for cases whose eval uploads came from DigiLocker instead.
function baseDoc(c: EvalCase, slot: DocType): SpecimenLike | undefined {
  const img = c.images[slot];
  if (img && img.kind !== "RECEIPT") return img;
  if (slot === "DL") {
    const r = c.registry.dl[0] ?? c.digilocker?.DL;
    return r && { kind: "DL", printed: { name: r.name, number: r.number, dob: r.dob, validTill: r.validTill } };
  }
  if (slot === "PAN") {
    const r = c.registry.pan[0] ?? c.digilocker?.PAN;
    return r && { kind: "PAN", printed: { name: r.name, number: r.number, dob: r.dob } };
  }
  const b = c.registry.bank;
  return b ? { kind: "BANK_PROOF", printed: { holderName: b.holderName, accountLast4: b.accountLast4, ifsc: b.ifsc } } : undefined;
}

// One sample photo: the persona's document with the chosen photo problem. Problems in the
// document itself (hidden text, an edited name) stay on it in a clean photo.
export function shotDoc(c: EvalCase, slot: DocType, variant: ShotVariant): SpecimenLike | undefined {
  const base = baseDoc(c, slot);
  if (!base) return undefined;
  const contentDefect = base.defect && !PHOTO_DEFECTS.has(base.defect) ? base.defect : undefined;
  const defect: SpecimenDefect | undefined = variant === "clean" ? contentDefect : variant;
  return { kind: base.kind, printed: { ...base.printed }, defect };
}
