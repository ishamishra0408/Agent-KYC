# Real phone photos (you take these)

Generated photos are clean in ways real ones never are. Before the AI reader meets a real driver, it has to hold up on real phone photos of printed cards (D-038).

1. **Print.** Run `npm run specimens`, open `evals/specimens/print/print-sheet.html` in a browser and print it on A4 at **100% scale** (not "fit to page"). Eight SPECIMEN cards come out at real ID-card size; cut them out.
2. **Shoot.** 21 photos with your phone, listed in `manifest.json`: every card in **daylight** and in the **evening**, and five deliberately bad shots of `C01-DL`.

   | Shot | How |
   |---|---|
   | daylight | By a window, card flat on a plain dark surface, filling most of the frame |
   | evening | Indoor bulb, card tilted about 15°, normal arm's length |
   | glare | Flash on, or a lamp reflecting in a bright patch across the card |
   | blurry | Move the phone as you press the shutter |
   | cropped | Frame it so the bottom third is cut off |
   | screen | Open `evals/specimens/print/C01-DL.png` on a laptop and photograph the screen |
   | dark | Lights off, flash off |

3. **Save** them here as JPG, named exactly as in the list: `<card>-<shot>.jpg`, e.g. `C01-DL-daylight.jpg`, `C31-DL-evening.jpg`.
4. **Run** `npm run evals:phone`. The app's reader (Gemma 4 31B, Sonnet fallback) reads each photo: a clean shot must pass the photo check and reach its case's decision, a bad shot must be caught as that problem. The report lands in `evals/results/PHONE.md`. It works with a partial set too.

Each photo is sent to OpenRouter to be read, upright, resized and without its EXIF (location, camera, time). Keep faces, hands and other papers out of the frame. These are SPECIMEN documents with made-up people: never put a real ID in this folder. Everything here but this README and `manifest.json` is git-ignored.
