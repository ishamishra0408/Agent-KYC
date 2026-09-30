import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSpecimen, type SpecimenLike } from "../ai/simulatedReader";
import type { DocReading } from "../domain/types";
import type { ChainReading } from "./aiReader";

// The app's photo step reads through this: one photo in, a reading out, plus who read it, which the
// ops console shows next to the document.
export interface PhotoRead {
  reading: DocReading;
  readBy: string; // "simulated", or the model that answered
  fallbackReason: string | null; // why the fallback model answered instead of the first choice
}

export interface PhotoReader {
  readonly name: string;
  read(photo: { shotId: string; doc: SpecimenLike }): Promise<PhotoRead>;
}

// The stand-in (D-024): reports what the SPECIMEN photo is known to contain.
export const simulatedPhotoReader: PhotoReader = {
  name: "simulated",
  read: async ({ doc }) => ({ reading: readSpecimen(doc), readBy: "simulated", fallbackReason: null }),
};

// The live reader (D-038): a model reads the demo camera's photo itself. The same photo gets the same
// answer, so readings are kept by the photo's bytes for the life of the server.
export function aiPhotoReader(ai: { readImage(bytes: Buffer): Promise<ChainReading> }, photoDir: string): PhotoReader {
  const cache = new Map<string, PhotoRead>();
  return {
    name: "ai",
    async read({ shotId }) {
      const bytes = await readFile(path.join(photoDir, `${path.basename(shotId)}.jpg`));
      const key = createHash("sha256").update(bytes).digest("hex");
      const kept = cache.get(key);
      if (kept) return kept;
      const r = await ai.readImage(bytes);
      const read = { reading: r.reading, readBy: r.answeredBy, fallbackReason: r.fallback };
      cache.set(key, read);
      return read;
    },
  };
}
