import sharp from "sharp";

// A phone photo carries where and with what it was taken in its EXIF (GPS, camera, time). Only the
// pixels go to OpenRouter: turned upright, at most 1600 px on the long side, and re-encoded, which
// drops the metadata (sharp keeps none unless asked).
export async function forSending(photo: Buffer): Promise<Buffer> {
  return sharp(photo).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}
