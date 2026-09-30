import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASES } from "../evals/cases";
import sharp from "sharp";
import { HOLDOUT_SUITE, runEvals, specimenPath } from "../evals/harness";
import { summarise } from "../evals/idnet/report";
import { forSending } from "../evals/phonePhoto";
import { heuristicReader, type ImageReader, naiveReader, oracleReader, RunAbortedError } from "../evals/readers";
import type { DocReading } from "../server/domain/types";

const imagesExist = existsSync(specimenPath("C01", "DL"));

describe("eval set", () => {
  it("has 10 good and 21 bad cases with unique ids", () => {
    expect(CASES.filter((c) => c.kind === "good")).toHaveLength(10);
    expect(CASES.filter((c) => c.kind === "bad")).toHaveLength(21);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it("says why every bad case is bad", () => {
    for (const c of CASES.filter((x) => x.kind === "bad")) expect(c.mustInclude.length).toBeGreaterThan(0);
  });

  it("agrees with the answer key when reading is perfect", async () => {
    const s = await runEvals(oracleReader);
    const misses = s.results.filter((r) => !r.outcomeOk || !r.reasonsOk).map((r) => `${r.id}: ${r.got} ${r.reasons.join(",")}`);
    expect(misses).toEqual([]);
    expect(s.gatePassed).toBe(true);
  });

  it("passes the independently written holdout", async () => {
    const s = await runEvals(oracleReader, { suite: HOLDOUT_SUITE });
    expect(s.results.filter((r) => !r.outcomeOk).map((r) => r.id)).toEqual([]);
    expect(s.gatePassed).toBe(true);
    // The only known disagreement: H12's reason code. Its author expected BANK_NAME_MISMATCH; question 1
    // was decided the other way (the owner must finish their own KYC first, D-031). H12 and H13 shaped
    // questions 1 and 2, so their reason codes no longer count as unseen evidence. Any new miss fails here.
    expect(s.results.filter((r) => !r.reasonsOk).map((r) => r.id)).toEqual(["H12"]);
  });

  // F-023: an error on a bad case must not count as a bad case caught.
  it.skipIf(!imagesExist)("fails the gate when the reader leaves cases unanswered", async () => {
    const flaky: ImageReader = {
      kind: "image",
      name: "flaky",
      read: async () => {
        throw new Error("timed out");
      },
    };
    const s = await runEvals(flaky, { suite: { ...HOLDOUT_SUITE, cases: HOLDOUT_SUITE.cases.filter((c) => c.kind === "bad").slice(0, 2) } });
    expect(s.badApproved).toBe(0);
    expect(s.unanswered).toBe(2);
    expect(s.gatePassed).toBe(false);
  });

  it.skipIf(!imagesExist)("stops the whole run, recording nothing, when the account or the budget runs out", async () => {
    const broke: ImageReader = {
      kind: "image",
      name: "broke",
      read: async () => {
        throw new RunAbortedError("no credit", "account");
      },
    };
    await expect(runEvals(broke, { suite: { ...HOLDOUT_SUITE, cases: HOLDOUT_SUITE.cases.slice(0, 2) } })).rejects.toThrow(RunAbortedError);
  });

  it("refuses an empty run, which would pass the gate", async () => {
    await expect(runEvals(oracleReader, { suite: { ...HOLDOUT_SUITE, cases: [] } })).rejects.toThrow(/No cases/);
  });

  it("fails the gate without document reading", async () => {
    const s = await runEvals(naiveReader);
    expect(s.badApproved).toBeGreaterThan(0);
    expect(s.gatePassed).toBe(false);
  });

  it.skipIf(!imagesExist)("heuristic checks catch some photo problems but still fail the gate", async () => {
    const naive = await runEvals(naiveReader);
    const heuristic = await runEvals(heuristicReader);
    expect(heuristic.badApproved).toBeLessThan(naive.badApproved);
    expect(heuristic.goodApproved).toBe(10);
    expect(heuristic.gatePassed).toBe(false);
  });

  // A malformed reading (an AI reader can send one) must fail closed, never pass as "fine".
  it("approves nothing photo-based when readings come back malformed", async () => {
    const broken: Partial<DocReading>[] = [{ quality: undefined }, { docType: undefined }, { suspiciousText: true as never }];
    for (const over of broken) {
      const s = await runEvals(oracleReader, { mutateReading: (r) => ({ ...r, ...over }) as DocReading });
      const photoBased = s.results.filter((r) => {
        const c = CASES.find((x) => x.id === r.id);
        return !(c?.digilocker?.DL && c.digilocker.PAN);
      });
      expect(photoBased.filter((r) => r.got === "APPROVE").map((r) => r.id), JSON.stringify(over)).toEqual([]);
    }
  });

  // A reader that drops fields or sends garbage must never cause an approval.
  it("approves nothing photo-based when readings lose their numbers and confidence", async () => {
    const s = await runEvals(oracleReader, {
      mutateReading: (r) => ({ ...r, fields: { ...r.fields, number: undefined }, confidence: Number.NaN }),
    });
    const photoBased = s.results.filter((r) => {
      const c = CASES.find((x) => x.id === r.id);
      return !(c?.digilocker?.DL && c.digilocker.PAN);
    });
    expect(photoBased.filter((r) => r.got === "APPROVE").map((r) => r.id)).toEqual([]);
  });
});

describe("a phone photo in the real-photo round", () => {
  it("goes out upright, at most 1600 px, and without its EXIF", async () => {
    // A 3000 x 2000 photo taken sideways (EXIF orientation 6), with a GPS-bearing EXIF block.
    const taken = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#777" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Make: "PhoneCo", Model: "P1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 58/1 0/1" } })
      .toBuffer();
    expect(await sharp(taken).metadata()).toMatchObject({ orientation: 6, exif: expect.any(Buffer) });
    const sent = await sharp(await forSending(taken)).metadata();
    expect(sent.exif).toBeUndefined();
    expect(sent.orientation).toBeUndefined();
    expect([sent.width, sent.height]).toEqual([1067, 1600]); // turned upright, then shrunk
  });
});

describe("the IDNet report", () => {
  it("counts a forgery on its own only when the same licence's genuine copy wasn't reported", () => {
    const row = (folder: string, file: string, flagged: boolean | null) => ({ folder, file, flagged, signs: flagged ? "a pasted field" : null, docType: "DL", answeredBy: "m", ms: 1 });
    const s = summarise([
      row("positive", "a", true), // a report on the genuine licence: about the licence, not an edit
      row("positive", "b", false),
      row("fraud1_copy_and_move", "a", true),
      row("fraud1_copy_and_move", "b", true),
      row("fraud2_face_morphing", "a", false),
      row("fraud2_face_morphing", "b", null), // unanswered
    ]);
    expect(s).toMatchObject({ caught: 2, forgedOnly: 1, unanswered: 1, genuine: { flagged: 1, n: 2 } });
  });
});
