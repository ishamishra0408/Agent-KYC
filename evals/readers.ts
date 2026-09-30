import { readFile } from "node:fs/promises";
import type { AiReading } from "../server/adapters/aiReader";
import { BudgetExceededError, OpenRouterError } from "../server/adapters/openrouter";
import { readSpecimen } from "../server/ai/simulatedReader";
import type { DocReading, DocType, PhotoQuality } from "../server/domain/types";
import type { SpecimenDoc } from "./cases";
import { photoStats } from "./photoStats";

// What an image reader gets: the photo and the slot it was uploaded to. Never the answer key.
export interface ReadInput {
  caseId: string;
  slot: DocType;
  imagePath: string;
  typedNumber?: string; // the number the driver typed into the form
}

// Readers that look at pixels: the heuristic baseline and the AI readers (Phase 3).
export interface ImageReader {
  readonly kind: "image";
  readonly name: string;
  read(input: ReadInput): Promise<DocReading>;
}

// Reference points built from the answer key. They bracket the real readers; they are not candidates.
export interface ReferenceReader {
  readonly kind: "reference";
  readonly name: string;
  read(input: ReadInput & { doc: SpecimenDoc }): Promise<DocReading>;
}

export type EvalReader = ImageReader | ReferenceReader;

function typedOnly(slot: DocType, typedNumber?: string): DocReading["fields"] {
  return slot === "BANK_PROOF" ? {} : { number: typedNumber };
}

// Upper bound: a perfect reader that sees exactly what's in the image.
// If the rules can't hit the gate with this, no model will.
export const oracleReader: ReferenceReader = {
  kind: "reference",
  name: "oracle",
  async read({ doc }) {
    return readSpecimen(doc);
  },
};

// Floor: no document reading at all. Trusts each upload is the right document and uses
// the number the driver typed. Shows what rules and registries miss on their own.
export const naiveReader: ReferenceReader = {
  kind: "reference",
  name: "naive",
  async read({ slot, typedNumber }) {
    return {
      docType: slot,
      quality: "ok",
      isScreenPhoto: false,
      suspiciousText: null,
      fields: typedOnly(slot, typedNumber),
      confidence: 1,
    };
  },
};

// Thresholds from `npx tsx evals/photo-stats.ts`: normal photos sit near brightness 180,
// sharpness 800-1400 and under 2% blown-out pixels.
export const HEURISTIC_LIMITS = {
  minAspect: 0.5, // height / width; a cut-off card is a thin strip
  minBrightness: 60,
  maxBlownOut: 0.2,
  minSharpness: 50,
} as const;

// Classic image checks, no AI: crop, darkness, glare, blur. Everything else as the naive reader.
// The point: anything this catches doesn't need a model.
export const heuristicReader: ImageReader = {
  kind: "image",
  name: "heuristic",
  async read({ slot, imagePath, typedNumber }) {
    const s = await photoStats(imagePath);
    const L = HEURISTIC_LIMITS;
    const quality: PhotoQuality =
      s.height / s.width < L.minAspect
        ? "cropped"
        : s.brightness < L.minBrightness
          ? "dark"
          : s.blownOut > L.maxBlownOut
            ? "glare"
            : s.sharpness < L.minSharpness
              ? "blurry"
              : "ok";
    return {
      docType: slot,
      quality,
      isScreenPhoto: false,
      suspiciousText: null,
      fields: quality === "ok" ? typedOnly(slot, typedNumber) : {},
      confidence: 1,
    };
  },
};

// Phase 3: an AI model reads the photo through OpenRouter. Like any image reader it gets only the
// photo; it doesn't even get the slot. `readings` keeps every answer, for the report's cost and speed.
// A failure that ends the whole run, not one case: no credit, a refused key, the budget reached.
// The run stops and nothing is recorded as a result (F-023).
export class RunAbortedError extends Error {
  constructor(
    message: string,
    readonly reason: "budget" | "account",
  ) {
    super(message);
  }
}

export function aiReader(name: string, ai: { readImage(bytes: Buffer): Promise<AiReading> }) {
  const readings: AiReading[] = [];
  const reader: ImageReader = {
    kind: "image",
    name,
    async read({ imagePath }) {
      const bytes = await readFile(imagePath);
      let r: AiReading;
      try {
        r = await ai.readImage(bytes);
      } catch (err) {
        if (err instanceof BudgetExceededError) throw new RunAbortedError(err.message, "budget");
        if (err instanceof OpenRouterError && (err.status === 401 || err.status === 402)) throw new RunAbortedError(err.message, "account");
        throw err;
      }
      readings.push(r);
      return r.reading;
    },
  };
  return { reader, readings };
}
