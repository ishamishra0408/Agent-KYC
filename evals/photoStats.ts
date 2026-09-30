import sharp from "sharp";

// Cheap, classic image measurements: no AI. Used by the heuristic baseline reader, and to show
// which photo problems a 30-line check catches before anyone reaches for a model.
export interface PhotoStats {
  width: number;
  height: number;
  brightness: number; // mean grey level, 0-255
  sharpness: number; // variance of the Laplacian: edges make it high, blur flattens it
  blownOut: number; // share of near-white pixels (glare, or white paper)
}

export async function photoStats(imagePath: string): Promise<PhotoStats> {
  const meta = await sharp(imagePath).metadata();
  // Measure on a fixed-width copy so every photo is judged at the same scale.
  const { data, info } = await sharp(imagePath).greyscale().resize({ width: 640 }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  let total = 0;
  let blown = 0;
  for (const v of data) {
    total += v;
    if (v >= 250) blown++;
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }

  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    brightness: total / data.length,
    sharpness: sumSq / n - (sum / n) ** 2,
    blownOut: blown / data.length,
  };
}
