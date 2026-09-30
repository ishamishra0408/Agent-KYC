# Failure log

Real mistakes from building this, and what changed because of them. Most end in a test, so they can't quietly come back; the rest say how they were checked.

## F-001 · The shared-account rule would have flagged honest fleet owners

- **When:** planning, 2026-09-28
- **What happened:** the first version of the trust-graph rule said "shared bank account → review".
- **Caught by:** an adversarial review pass on the plan (a separate AI auditor).
- **Impact if shipped:** every fleet owner paying hired drivers into one account would flood the review queue, and good drivers would sit stuck.
- **Fix:** an owner-link rule. The account holder plus drivers who name that holder as their fleet owner make a fleet; unrelated people on one account make a ring (D-007).
- **Guarded by:** `tests/rules.test.ts` (fleet not flagged, ring flagged), `tests/graph.test.ts`, eval cases C08 (approve), C14 (ring) and C22 (fix).

## F-002 · Step 5 (re-notify) vanished from a cut-down plan

- **When:** planning, 2026-09-28
- **What happened:** cutting the plan to fit one day silently dropped the re-notify step. No build item, no test.
- **Caught by:** the same auditor.
- **Fix:** the send gateway was built in Phase 2, with a test that moves a fake clock through a week.
- **Lesson:** when you cut scope, check that every original requirement still has a test, not just a line in the plan.
- **Guarded by:** `tests/nudges.test.ts`.

## F-003 · My own test was wrong about time

- **When:** build, Phase 2
- **What happened:** I expected a nudge sent at 10:30 PM on day 0 to be allowed again at 8 AM on day 2. The code said day 3, and the code was right: 48 hours later is 10:30 PM on day 2, which is quiet hours.
- **Lesson:** write time tests from worked examples, and when code and test disagree, check the arithmetic before "fixing" the code.
- **Guarded by:** `tests/nudges.test.ts` ("moves a 2-day wait that ends at night to the next morning").

## F-004 · Some test images weren't fair, twice

- **When:** build, Phase 1
- **What happened:** the glare image left the name readable and the "too dark" photo was fully legible. A model that read through them would fail the test while being right by any fair standard. My first fix wasn't enough: the auditor could still read the name on the glare and dark images.
- **Caught by:** looking at the generated images myself, then the auditor looking again.
- **Fix:** glare is now opaque over each card's fields, and dark photos are near-black and low-contrast. Checked by eye and by measurement (`npx tsx evals/photo-stats.ts`).
- **Lesson:** test the test. If the answer key says a photo is unreadable, it has to actually be unreadable, and "I fixed it" needs a second pair of eyes.

## F-005 · A clean photo with no number would have been approved

- **When:** build, Phase 2 audit
- **What happened:** if the reader said a licence photo was fine but returned no number, the registry lookup was silently skipped and nothing else objected. The driver got approved on their typed name alone. A sloppy or manipulated AI reader could have approved people by leaving a field out. Broken confidence values (NaN) also slipped through.
- **Caught by:** the auditor.
- **Fix:** approval now needs positive evidence for every check: a registry record for the licence and PAN, a verified bank account, a matched selfie. A missing number asks for a retake; broken confidence goes to a person (D-013).
- **Guarded by:** `tests/rules.test.ts` ("fails closed"), and a test that strips numbers and confidence from every test-set reading and checks that nothing photo-based gets approved.

## F-006 · "Kumari" treated as a title let an impostor match

- **When:** build, Phase 2 audit
- **What happened:** I stripped "Kumari" as an honorific. It's a common surname, so "Priya Kumari" matched "Priya Sharma" on first name alone.
- **Fix:** only real titles are stripped, and a lone first name no longer counts as a match for identity checks.
- **Guarded by:** `tests/names.test.ts`.

## F-007 · "R Ramesh" didn't match "Ramesh R"

- **When:** build, Phase 2 audit
- **What happened:** the initial "R" grabbed the word "RAMESH" first and left nothing for the whole word to match. Names where the initial and given name share a letter are common in South India, so honest drivers would have been asked to fix nothing.
- **Fix:** whole words match first, initials second.
- **Guarded by:** `tests/names.test.ts`.

## F-008 · "AI can't approve" was a label, not a lock

- **When:** build, Phase 2 audit
- **What happened:** the status machine refused the `ai` actor, but any code could hand the onboarding service a made-up "approve" decision, a driver could sign up already marked "confirmed by owner", and the database handle was public.
- **Fix:** only decisions produced by the rules engine can be applied (they're registered and frozen when made); the database handle is private; the event and decision logs refuse edits at the database level; only the fleet owner a driver named can confirm them, and that owner must have passed KYC (D-014, D-017).
- **Guarded by:** `tests/store.test.ts`, `tests/status.test.ts` (exact list of ways into APPROVED), `tests/boundaries.test.ts`.

## F-009 · The baseline flattered the AI

- **When:** build, Phase 2 audit
- **What happened:** I compared "no document reading" (10 of 20 bad cases approved) with "perfect reading" (0 of 20) and called the gap the AI's job. But blur, glare, darkness and crops are caught by a few lines of plain image code.
- **Fix:** a third baseline: classic image checks, no AI. It gets to 4 of 20. The AI's real job is what's left: screen photos and hidden instructions (D-018).
- **Lesson:** measure the cheap option before crediting the expensive one.

## F-010 · Approvals carried no evidence

- **When:** build, Phase 2 audit
- **What happened:** rejections came with reasons, approvals came with nothing, so an approval couldn't explain itself.
- **Fix:** every decision now lists what passed (licence valid until when, PAN found, same person, bank verified, selfie matched), each marked SIMULATED where it came from a simulated registry.
- **Guarded by:** `tests/rules.test.ts`, `tests/store.test.ts`.

## F-011 · The answer key and the rules were written by the same person

- **When:** build, Phase 2 audit
- **What happened:** the perfect-reader result shows the rules agree with the answer key, but I wrote both, so that agreement proves less than it looks.
- **Fix:** a holdout of 16 cases, written by a separate AI agent on a different model, from `PRD.md` and `DECISIONS.md` only. It was barred from the rules code and the tests (D-019).
- **Result:** the rules got 16 of 16 outcomes right. Two reason codes differed (H12, H13), and the holdout author had already flagged both as places where the written policy is ambiguous. That was an open product decision, not a bug. It was settled in D-031.

## F-012 · The gate was an absolute number

- **When:** build, Phase 4, found by the holdout
- **What happened:** "at least 9 good cases approved" only makes sense for a set with 10 good cases. On the 6-good holdout, a perfect result still failed.
- **Fix:** the gate is relative: no bad case approved, at most one good case missed.
- **Guarded by:** `tests/evals.test.ts` (holdout passes on outcomes).

## F-013 · The API took the web server's port

- **When:** build, Phase 4
- **What happened:** the dev launcher sets `PORT` for the web server. The API read the same variable, so the web page couldn't reach it (every call failed with a 502).
- **Fix:** the API reads its own `API_PORT` (default 3101).
- **Lesson:** generic names like `PORT` belong to whoever launches the process.

## F-014 · A reviewer's note could follow them to the next case

- **When:** build, Phase 4 audit
- **What happened:** the decision form kept its state when the reviewer switched cases, so a note typed for one driver could be recorded against the next.
- **Fix:** the form and the case view are keyed by driver, so their state resets with the case.
- **Checked by:** switching cases in the review queue with a note typed. No automated UI test yet.
- **Lesson:** in a review tool, anything typed about a case must go away with the case.

## F-015 · Two demo drivers had no way forward

- **When:** build, Phase 4 audit
- **What happened:** Vinod (name mismatch) and Kiran (fleet owner not confirmed) were asked for fixes, but the app had no way to resubmit and no way for an owner to confirm. Every rule was right, and they were still stuck.
- **Fix:** "Submit again", and an owner-confirmation stand-in in the ops console (D-028).
- **Guarded by:** `tests/api.test.ts` ("lets a driver submit again…", "approves a hired driver once the fleet owner confirms them").
- **Lesson:** walk every persona to the end. A status with no exit is a bug.

## F-016 · The demo didn't fit the screen

- **When:** build, theme pass
- **What happened:** panel heights were fixed guesses (`100vh` minus the top bar). The themed top bar wrapped onto two rows, so the page ran taller than the window and the console header slid under the bar. A Hindi button label also wrapped onto two lines.
- **Fix:** the page is a flex column, and the phone and console take whatever height is left. Paired buttons keep their labels on one line.
- **Checked by:** page height equals window height at 1440×900; no sideways scroll at 768 px. No automated layout test yet.
- **Lesson:** size panels from their container, not from guesses. Check layouts in the longest language.

## F-017 · A screen sweep passed colours that fail when you touch them

- **When:** UPS palette, audit
- **What happened:** an in-browser check of every visible text element found no contrast problems in either theme. But it only saw what was on screen. A selected "Needs a fix" button, a hovered one and the translucent BOOKED stamp were all below 4.5:1, and the road stepper's progress bar was still rules-green.
- **Fix:** darker fix, rules and dark danger colours; brand colour for the road; a test that checks colour pairs from the style sheet itself, states included.
- **Guarded by:** `tests/theme.test.ts` (it fails with the old colours: "--fix on --surface-2 is 4.40:1").
- **Lesson:** checking the screen proves the screen. Check the tokens to cover the states.

## F-018 · Moving "a person" to blue hid it from some colour-blind users

- **When:** UPS palette, audit
- **What happened:** "a person" moved from orange to blue so it wouldn't blend into the brand. For red-green colour-blind users, the new blue and the AI purple look almost the same.
- **Fix:** each provenance chip carries an icon (sparkles for an AI slot, a checklist for the rules, a person for a person), so colour is never the only cue. The chips already carry text.
- **Lesson:** when a colour carries meaning, change it with colour blindness in mind, and never let colour be the only signal.

## F-019 · A reader confidence of 1.5 was trusted

- **When:** OPA migration, while freezing the old decisions
- **What happened:** the code's comment said an out-of-range confidence counts as "not confident". The code only checked the lower bound, so a broken reading claiming 1.5 passed as extra sure. A hand-built edge case in the new decision snapshot caught it.
- **Fix:** policy v3 trusts a confidence only between 0.8 and 1.
- **Guarded by:** `policy/kyc_test.rego` (`test_confidence_above_one_is_not_trusted`), `tests/rules.test.ts`, and the decision snapshot.
- **Lesson:** writing a rule down a second time, in a second language, is a review. The comment and the code had disagreed since the rules were first written.

## F-020 · A stale compiled policy stopped the server from starting

- **When:** OPA migration
- **What happened:** the contract was updated to expect notices before the policy was rebuilt. On restart, the contract refused the old policy's answers and the demo server stopped at seeding.
- **Fix:** rebuild with `npm run policy:build`. The server refusing to start is the intended failure: a mismatched policy never decides anything. It had worked only because the demo decides drivers at boot. Now the contract checks the policy itself at startup (its severity table and a test decision), so a stale build fails at boot either way.
- **Guarded by:** `tests/policy.test.ts` fails when the Rego changes without a rebuild; `tests/rules.test.ts` checks that a mismatched policy fails at startup.
- **Lesson:** fail loudly at boot, not quietly at the first driver.

## F-021 · The clock's toast was invisible

- **When:** found by Isha in Safari
- **What happened:** after moving the demo clock, the summary ("5 nudges sent…") never showed. The top bar's frosted-glass blur (`backdrop-filter`) makes a fixed-position child position itself inside the bar, not the window, so the toast sat hidden in the bar. My own browser checks had hit the same thing, and I had blamed stale screenshots.
- **Fix:** the toast renders outside the bar, straight into the page, and shows only the counts that aren't zero ("Sat, 3 Oct, 10:00 pm · 5 held").
- **Checked by:** in the browser, the toast is now a child of the page body, on top, and inside the window. Not re-run in Safari itself; the fix removes the cause rather than working around it.
- **Lesson:** when a check disagrees with what the page says it did, find out why before calling the check flaky.

## F-022 · A licence date that isn't a date would have passed

- **When:** question 9 audit
- **What happened:** a registry date like "2026-13-45" compared as "not expired", so the licence was approved, and it could never lapse either.
- **Fix:** the policy sends an unreadable licence date to a person, and "licence valid" needs a real date.
- **Guarded by:** `policy/kyc_test.rego` (`test_an_unreadable_licence_date_goes_to_a_person`). The reviewed decisions didn't change.

## F-023 · The first real model run: no answers, false alarms, and a gate that passed anyway

- **When:** Phase 3, the first run of a real model (free Qwen 3.8 27B, three cases)
- **What happened:** three things. Two cases came back with no answer and one with its JSON cut off: the model thinks before it answers, and the thinking used up the 800-token allowance. Once it answered, it copied every document's "SPECIMEN… Not a real document" line as hidden text, which would have sent every driver to a person. And that first run, with all three cases errored, still printed "gate PASS": an error on a bad case counted as a bad case caught.
- **Fix:** a 3,000-token allowance; the prompt says specimen notices are expected (a line that comes out before real documents, D-035); a case the reader didn't answer now fails the gate; and no credit or a refused key stops the whole run with nothing written (the budget running out keeps only finished results), instead of recording a model that "approved nothing". A run on chosen cases says it's a smoke test, not a gate result. The rerun: 9 photos read, 3 of 3 cases right, $0.
- **Guarded by:** `tests/evals.test.ts` (unanswered cases fail the gate; a stopped run records nothing; an empty run is refused), `tests/aiReader.test.ts` (a missing credit stops the run; the key never reaches an error).
- **Lesson:** run the cheapest real model first. Every reader the harness had met always answered, so nothing had asked what an error means for the gate.

## F-024 · A slow answer wasn't retried, and a rate limit outlasted the retries

- **When:** Phase 3, the model comparison and the first run of the app's reader
- **What happened:** two photos went unanswered. Qwen's C21 timed out at 90 seconds: OpenRouter sends headers at once and the answer when the model is done, so the timeout fired while the answer was still arriving, outside the part of the client that retries. That one photo failed Qwen's gate. Then the app reader's first run lost C12 when both Gemma's and Sonnet's providers answered "too many requests" through retries 1 and 2 seconds apart.
- **Fix:** the answer is read inside the retry; rate limits back off 1, 2 and 4 seconds, or as long as the provider asks, up to 10; a caller that gives up (the switch to Sonnet) stops without retrying.
- **Guarded by:** `tests/photoReader.test.ts` (a slow answer is retried; a cancelled one isn't).
- **Lesson:** because an unanswered case fails the gate (F-023), both bugs showed up as failures instead of flattering the models. Qwen hasn't been re-run since the fix.

## F-025 · A holdout case described a pasted name the image didn't show

- **When:** adding signs of editing (D-040)
- **What happened:** holdout case H15 says "name pasted onto a PAN", but the specimen generator only drew the paste on licences, so its PAN looked untouched. The perfect reader reads the answer key, not the image, so it would have reported an edit nobody could see, and the case would have tested nothing.
- **Fix:** the generator draws the pasted name on PAN cards too. Only H15's image changed; every other photo is byte for byte the same.
- **Lesson:** a reference reader built from the answer key can't tell you whether the answer is visible. Look at the photo.

## F-026 · The first IDNet count flattered the reader, and the reason for the rule was wrong

- **When:** writing up the IDNet round (D-040)
- **What happened:** the first report said the reader flagged 15 of 120 forgeries. Reading the reports, all 8 of Gemma's named the height field, 7 of them calling the height itself implausible (7 ft 10 in, a quirk of the synthetic data), on genuine and forged cards alike: they were about the licence, not the edit. Separately, D-040 said a swapped portrait passes the face match, but the face match compares the selfie with the registry's photo; a pasted portrait only gets through where the registry has none.
- **Fix:** the report now pairs each forgery with the same licence's genuine copy, splits the counts by the model that answered, and lists every report. Pairing alone wasn't enough (its 10 still held two height remarks and missed two real catches), so D-040 states the result per model, from the reports themselves. D-040's reason now says what the checks actually miss.
- **Lesson:** a detection count means little until the reports behind it are read. Pair each positive with its own negative.
