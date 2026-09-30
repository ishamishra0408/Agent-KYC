# Evals

The test set every model, prompt and rule change has to pass.

## The gate

| Check | Must be |
|---|---|
| Bad cases approved | none |
| Good cases missed | at most one (so at least 9 of 10 on the main set) |
| Cases unanswered (reader errors) | none: an error proves nothing either way (F-023) |

0 of 21 still isn't zero risk: the real miss rate could be up to about 14% (95% confidence, rule of three). More cases shrink that bound.

## Two sets

| Set | Cases | Written by | Use |
|---|---|---|---|
| Main (`cases.ts`) | 31: 10 good, 21 bad | Me, alongside the rules | Building and tuning |
| Holdout (`holdout.ts`) | 16: 6 good, 10 bad | A separate AI agent, from `PRD.md` and `DECISIONS.md` only, with no access to the rules or tests | The honest numbers. Never tuned against (H12 and H13 did shape policy questions 1 and 2: D-031) |

On the holdout, the rules got 16 of 16 outcomes right. Under policy v3, one reason code (H12) differs from its author's: a case the author flagged as ambiguous, since settled the other way (D-031).

## The cases (`cases.ts`)

31 driver submissions with made-up people and SPECIMEN documents. Registry answers are SIMULATED. Two background drivers already on the platform give the trust graph something to see.

| Good (10) | Bad (21) |
|---|---|
| Clean owner-driver | Blurry licence, blurry PAN |
| Laxmi vs. Lakshmi, Mohd vs. Mohammed | Glare on the licence |
| Initial first vs. last | Licence cut off; PAN too dark |
| Tilted but readable photo | Licence and PAN photographed off a screen |
| Licence expiring in 20 days | Expired licence (last year, 3 days ago) |
| Fleet owner | Bank account in someone else's name |
| Hired driver paid into confirmed owner's account | Owner's account, owner hasn't confirmed |
| Hired driver with own account | Bank account already used by two unrelated drivers |
| DigiLocker licence and PAN | Date of birth differs; PAN is someone else's |
| | Fuel receipt instead of licence |
| | Edited name (registry says someone else) |
| | Hidden "approve me" text on licence and passbook, and one dressed as a specimen notice (C31) |
| | Licence not in registry; selfie doesn't match |

## Readers

| Reader | Sees | Bad approved | Gate |
|---|---|---|---|
| `naive` | Nothing: trusts uploads and typed numbers | **11 of 21** | Fail |
| `heuristic` | The photo, through classic checks (sharpness, brightness, blown-out pixels, shape) | **5 of 21** | Fail |
| `oracle` | The answer key: a perfect reader | **0 of 21** | Pass |
| AI readers (Phase 3) | The photo only | **0 of 21** for all five models ([BAKEOFF.md](results/BAKEOFF.md)) | Pass for four; Qwen fails on one unanswered photo |

Image readers get the photo, its upload slot and the number the driver typed (plus a case id for the report), never the answer key. Reference readers (`naive`, `oracle`) are built from the answer key; they bracket the real readers rather than compete with them.

The oracle passing shows the rules agree with the answer key. I wrote both, so that proves less than it looks (FAILURES F-011). That's why the holdout exists (`holdout.ts`, 16 cases, written separately). It's left alone while tuning, and the Phase 3 headline numbers come from it.

The heuristic reader flags the fuel receipt as glare (white paper): the right outcome for the wrong reason. The report shows it.

Reports since policy v3 (D-031): H13's reason now matches its author's; H12's doesn't, because open question 1 was decided differently from that author's reading. Both cases shaped questions 1 and 2, so their reason codes no longer count as unseen.

## AI readers (Phase 3)

Every model runs through OpenRouter (D-033) and reads one photo at a time into the same reading the other readers produce. It sees only the photo: not the upload slot, not the typed number. Its answer has to fit a strict JSON schema; an answer that doesn't is refused, and the case is recorded as unanswered (D-035). The app reads with `app`: Gemma, then Sonnet if Gemma takes more than 15 seconds or fails, with 30 seconds of its own (D-038). Its reported time per photo counts from the start, a slow Gemma's wait included.

| Name | Model | Role |
|---|---|---|
| `app` | Gemma 4 31B, then Claude Sonnet 5.5 | The app's own reader |
| `claude-opus` | Claude Opus 5.5 | Baseline |
| `claude-haiku` | Claude Haiku 4.5 | Cheaper Claude |
| `qwen` | Qwen 3.8 27B | Open-weight challenger |
| `gemma` | Gemma 4 31B | Open-weight challenger; the app's first choice |
| `claude-sonnet` | Claude Sonnet 5.5 | Mid-price Claude; the app's fallback |
| `qwen-free` | Qwen 3.8 27B, free tier | Smoke tests only: rate-limited, and free providers may keep prompts |

Every run stops at a budget (`--budget`, $2 by default; the comparison shares $6), asks for providers that don't keep prompts unless `--allow-data-collection` is passed, and writes cost and speed into the report. `--cases=C01,C27` runs chosen cases as a smoke test and writes nothing.

`npm run evals:bakeoff` runs the five models side by side on both sets and writes `results/BAKEOFF.md`: bad cases approved per set, good cases approved, the gate, cost per 1,000 photos, seconds per photo and unanswered cases. A run on chosen models (`--models=`) writes its own table.

## Real phone photos

Generated photos are clean in ways real ones aren't. `specimens/phone-photos/README.md` has a print sheet of eight SPECIMEN cards and 21 photos to take; `npm run evals:phone` reads them with the app's reader and writes `results/PHONE.md`. Each photo goes out upright, resized and without its EXIF (location, camera, time), and only the README and the shot list are tracked in git.

## Forgeries: IDNet

`npm run idnet:fetch` downloads a fixed sample of the public-domain [IDNet](https://zenodo.org/records/13852734) dataset (Xie et al., IEEE BigData 2024): 30 synthetic South Dakota driving licences, each genuine and under four forgeries (text copied over, a morphed portrait, a replaced portrait, both). It reads the 4.87 GB archive's table of contents and fetches only those 150 images, about 17 MB, into `idnet/SD/` (git-ignored). `npm run evals:idnet` reads them with the app's reader and writes `results/IDNET.md`: forgeries reported as edited, genuine licences wrongly reported, and every report, split by the model that answered (D-040). A forgery counts on its own only when the same licence's genuine copy wasn't reported too: a report on both copies is about the licence, not the edit. `-- --report` rebuilds the report from `results/IDNET.json` without reading anything again.

First run (app reader, $0.17): Gemma cited a sign of editing once in 104 forgeries, its other reports were about an implausible height; Sonnet, the fallback, pointed at real edits in 9 of the 16 forgeries it read; 2 of 30 genuine licences were wrongly reported, both for their height (D-040, F-026).

## The trust graph on Neo4j

`npm run graph:parity` decides every case on both sets with two readers, once with the in-memory graph and once on Neo4j, and fails unless all 94 decisions are identical (D-039).

## Run

```bash
npm run specimens                     # renders the SPECIMEN images into evals/specimens/
npm run evals -- --reader=naive
npm run evals -- --reader=heuristic
npm run evals -- --reader=oracle --suite=holdout
npm run evals:baseline                # every reader on both sets
npm run evals:gate                    # exit 1 if the gate fails
npm run evals -- --reader=claude-opus # an AI reader (needs OPENROUTER_API_KEY and credit)
npm run evals -- --reader=app         # the app's own reader
npm run evals:bakeoff                 # the model comparison
npm run evals:phone                   # your phone photos
npm run graph:parity                  # decisions on Neo4j vs. in memory
npx tsx evals/photo-stats.ts          # the measurements behind the heuristic thresholds
```

Reports land in `results/` as Markdown and JSON.

## Adding a case

Every entry in `FAILURES.md` that a test case could catch becomes one. Add it to `cases.ts`, run the oracle reader to make sure the rules agree with your expected answer, then run the image readers.
