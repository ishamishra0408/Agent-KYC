# Decision log

Each entry: what was decided, what else was on the table, and why. Newest at the bottom.

## At a glance

| # | Decision | What it cost |
|---|---|---|
| 001 | [AI proposes; code and people decide](#d-001--ai-proposes-code-and-people-decide) | Rules need upkeep; what they can't settle goes to a person, not to the model |
| 002 | [Tests before prompts](#d-002--tests-before-prompts) | A slower start: 30 cases and a gate before any model code |
| 003 | [TypeScript, Vite + React + Express + SQLite](#d-003--typescript-vite--react--express--sqlite) | More work up front than Python + Streamlit, for a product-grade UI and one language for app and evals |
| 004 | [Sponsor services behind interfaces](#d-004--sponsor-services-behind-interfaces) | An interface per provider; Claude through OpenRouter rather than Anthropic's own SDK |
| 005 | [Fake SPECIMEN documents only](#d-005--fake-specimen-documents-only) | Less realism than real IDs; printed-card phone photos and public IDNet forgeries fill some of the gap |
| 006 | [Nudge rules](#d-006--nudge-rules) | Fewer reminders: at most one every two days, none from 9 PM to 8 AM |
| 007 | [Fleet owners and shared accounts](#d-007--fleet-owners-and-shared-accounts) | A confirmation step before a hired driver can be paid into an owner's account |
| 008 | [Name matching understands transliteration](#d-008--name-matching-understands-transliteration) | "R Kumar" matches "Ramesh Kumar"; the registry checks catch impostors |
| 009 | [A photo of a screen is a fix, not fraud](#d-009--a-photo-of-a-screen-is-a-fix-not-fraud) | A fraudster's screen photo gets a retake request, not a review |
| 010 | [Review outranks fix](#d-010--review-outranks-fix) | A fixable driver waits for a person if anything else is risky |
| 011 | [Graph checks in memory first](#d-011--graph-checks-in-memory-first) | No real graph until Phase 5; the in-memory one keeps its interface |
| 012 | [Only trust numbers from good photos](#d-012--only-trust-numbers-from-good-photos) | A retake instead of a registry lookup on a poor photo |
| 013 | [Approval needs positive evidence](#d-013--approval-needs-positive-evidence) | More cases reach a person; an absence of problems never approves |
| 014 | [Only the rules engine's own decisions can be applied](#d-014--only-the-rules-engines-own-decisions-can-be-applied) | A contract layer between the policy and the database, and append-only logs |
| 015 | [The passbook photo is optional](#d-015--the-passbook-photo-is-optional) | A poor passbook photo no longer blocks; the Rs 1 check carries the proof |
| 016 | [A third request for the same fix goes to a person](#d-016--a-third-request-for-the-same-fix-goes-to-a-person) | More reviewer load instead of an endless fix loop |
| 017 | [Only a verified fleet owner can vouch for a hired driver](#d-017--only-a-verified-fleet-owner-can-vouch-for-a-hired-driver) | Friction for fleets: every new hired driver starts unconfirmed |
| 018 | [Cheap checks before AI](#d-018--cheap-checks-before-ai) | A no-AI baseline to build and keep, to show where AI earns its cost |
| 019 | [A holdout written by someone who never saw the code](#d-019--a-holdout-written-by-someone-who-never-saw-the-code) | Fewer cases to tune on; the holdout's numbers are the ones reported |
| 020 | [The gate is relative](#d-020--the-gate-is-relative) | On a large set, one miss is stricter than any percentage |
| 021 | [Drivers never see why they were sent to review](#d-021--drivers-never-see-why-they-were-sent-to-review) | Less transparency for a driver sent to review |
| 022 | [One standard for photos, applied twice](#d-022--one-standard-for-photos-applied-twice) | Coaching and the rules are coupled: one change moves both |
| 023 | [The demo is seeded by running the real flow](#d-023--the-demo-is-seeded-by-running-the-real-flow) | Seeding breaks whenever the flow changes, by design |
| 024 | [Scripted stand-ins until Phase 3, labeled as such](#d-024--scripted-stand-ins-until-phase-3-labeled-as-such) | Until a model passed the gate, the demo showed labelled templates, not AI |
| 025 | [The demo runs on its own clock](#d-025--the-demo-runs-on-its-own-clock) | A demo-only clock to maintain |
| 026 | [A logistics theme, playful but never vague about trust](#d-026--a-logistics-theme-playful-but-never-vague-about-trust) | More design work, with whimsy kept off every trust signal |
| 027 | [Sounds off by default; motion follows the system](#d-027--sounds-off-by-default-motion-follows-the-system) | Less delight on first use |
| 028 | [Every "needs a fix" has a way out](#d-028--every-needs-a-fix-has-a-way-out) | A resubmission path, and a labelled stand-in for the owner's confirmation |
| 029 | [UPS colours, with provenance kept apart from the brand](#d-029--ups-colours-with-provenance-kept-apart-from-the-brand) | Cool colours are reserved for provenance, never for the brand |
| 030 | [The decision rules are policy as code, on Open Policy Agent](#d-030--the-decision-rules-are-policy-as-code-on-open-policy-agent) | A second language (Rego) and a build step |
| 031 | [The eight policy questions, settled (policy v3)](#d-031--the-eight-policy-questions-settled-policy-v3) | Each answer is a test; holdout case H12 no longer matches its author's reason |
| 032 | [Question 9: a lapsed licence locks bookings (policy v4)](#d-032--question-9-a-lapsed-licence-locks-bookings-policy-v4) | A new status and a daily job; a driver approved by hand without a registry date isn't tracked for expiry |
| 033 | [OpenRouter only](#d-033--openrouter-only) | One vendor between us and every model |
| 034 | [The demo UI assumes an informed viewer](#d-034--the-demo-ui-assumes-an-informed-viewer) | No onboarding copy: a first-time visitor gets less help |
| 035 | [The AI document reader is measured before it reads for a driver (Phase 3)](#d-035--the-ai-document-reader-is-measured-before-it-reads-for-a-driver-phase-3) | The comparison ran ($3.48) before any driver saw a model |
| 036 | [The architecture is a C4 model, drawn with drawing-office](#d-036--the-architecture-is-a-c4-model-drawn-with-drawing-office) | Rendering needs Docker and a drawing-office clone |
| 037 | [Liquid glass on the navigation layer, and accessibility built in](#d-037--liquid-glass-on-the-navigation-layer-and-accessibility-built-in) | An 85% tint, less see-through than glass usually is, so every label passes contrast |
| 038 | [The app reads photos with Gemma 4 31B, and Claude Sonnet when Gemma is slow or fails](#d-038--the-app-reads-photos-with-gemma-4-31b-and-claude-sonnet-when-gemma-is-slow-or-fails) | About 9 s a photo, and up to 45 s before "try again" |
| 039 | [The trust graph runs on Neo4j, and no answer sends the case to a person (policy v5)](#d-039--the-trust-graph-runs-on-neo4j-and-no-answer-sends-the-case-to-a-person-policy-v5) | A network hop per check; while the free tier is paused, cases go to a person |
| 040 | [The reader reports signs of editing, and an edited document goes to a person (policy v6)](#d-040--the-reader-reports-signs-of-editing-and-an-edited-document-goes-to-a-person-policy-v6) | The reader rarely notices a forgery: a safety net, not a detector |
| 041 | [Provenance as small markers, not coloured bands; each message said once](#d-041--provenance-as-small-markers-not-coloured-bands-each-message-said-once) | Colour says less; icons and labels say who produced what |
| 042 | [A preserve-mode polish, run through an outside design audit (tasteskill)](#d-042--a-preserve-mode-polish-run-through-an-outside-design-audit-tasteskill) | Every keycap is now a pill, and the seven-step type scale moved some text by a pixel |
| 043 | [Outside components from 21st.dev, reused or rewritten according to their licences](#d-043--outside-components-from-21stdev-reused-or-rewritten-according-to-their-licences) | Screenshots that go stale when the UI changes, a summary that takes about a second to appear the first time, and more motion than D-041 left |

## D-001 · AI proposes; code and people decide

- **Options:** (a) the model decides above a confidence threshold; (b) the model extracts and flags, rules decide; (c) rules only, no model.
- **Decision:** (b). No status-machine edge into APPROVED allows the `ai` actor. `tests/status.test.ts` checks every edge.
- **Why:** KYC mistakes are expensive (fraud) and have to be explainable. Rules give a reason code and a version for every decision.
- **Trade-off:** rules need upkeep, and edge cases the rules can't settle go to a person rather than to model judgment.

## D-002 · Tests before prompts

- **Decision:** 30 cases (10 good, 20 bad) and a hard gate (0 bad approved, at most 1 good case missed; see D-020) before any model code.
- **Why:** it defines "good enough" before anyone falls in love with a prompt.
- **Result so far:** no document reading approves 11 of 21 bad cases; classic image checks with no AI, 5 of 21; perfect reading, 0 of 21. The model's job is the last 5. C31 joined for the AI readers (D-035). See `evals/results/`.

## D-003 · TypeScript, Vite + React + Express + SQLite

- **Options:** Python + Streamlit (fast, prototype look) vs. TypeScript + React (product look).
- **Decision:** TypeScript. It's the stack of my last project, the UI will look like a product to interviewers, and the evals and the app share one language.

## D-004 · Sponsor services behind interfaces

- **Decision:** OpenRouter (Claude Opus 5.5 as the baseline, open-weight models for the comparison; Crusoe dropped, D-033), Neo4j Aura Free, Plaud and Vultr all sit behind ports (`RegistryPort`, `GraphPort`, reader and writer interfaces).
- **Why:** providers change every few months. Swapping one shouldn't touch the rules.
- **Trade-off:** Claude through OpenRouter instead of Anthropic's own SDK. Fine for a portfolio; revisit for production.

## D-005 · Fake SPECIMEN documents only

- **Decision:** generated, clearly marked SPECIMEN, made-up people, generic layouts with no government emblems or real card designs. Deterministic, so every run sees the same images.
- **Why:** no real IDs ever enter the repo or a model. Five printed and phone-photographed specimens will check that results hold on real photos.

## D-006 · Nudge rules

- **Decision:** at most 1 nudge per 2 days; nothing from 9 PM to 8 AM IST; stop on approval or opt-out (since v3, an approved driver gets one licence renewal reminder: D-031); drivers waiting on us get one status update per wait, and it doesn't count toward the limit.
- **Why:** the old 2-day cadence becomes a ceiling, not a schedule. Silence beats nagging people about our own delay.

## D-007 · Fleet owners and shared accounts

- **Decision:** a hired driver may be paid into their fleet owner's account once the owner confirms them. If the claim isn't confirmed yet, the driver is asked to get it confirmed (a fix). Strangers sharing one account go to a person.
- **Why:** paying drivers into the owner's account is normal for fleets. A ring of unrelated people on one account isn't.
- **Came from:** failure F-001.

## D-008 · Name matching understands transliteration

- **Decision:** Laxmi and Lakshmi, Mohd and Mohammed, Gowda and Gouda, "Sathishkumar" and "Sathish Kumar", and initials in either order all match. A shared surname alone never does, and neither does a lone first name. Only real titles (Shri, Smt, Mr) are ignored; Kumari and Devi are surnames.
- **Trade-off:** "R Kumar" matches "Ramesh Kumar". Accepted, because the licence registry and the other checks catch impostors, while rejecting honest drivers over spelling is a fairness problem.

## D-009 · A photo of a screen is a fix, not fraud

- **Decision:** ask for a photo of the card or a DigiLocker fetch. Don't send it to review.
- **Why:** digital licences are legitimate, so plenty of honest drivers will photograph a screen.

## D-010 · Review outranks fix

- **Decision:** if any reason needs a person, the case goes to a person, even if something fixable is also wrong.
- **Why:** so a risky case can't be "fixed" around.

## D-011 · Graph checks in memory first

- **Decision:** Phases 0–2 use an in-memory graph with the same interface Neo4j will implement in Phase 5.
- **Why:** tests stay fast and offline, and the rules don't care where the signal comes from.

## D-012 · Only trust numbers from good photos

- **Decision:** registry lookups run only on photos that passed the quality checks.
- **Why:** an unreadable photo should say "retake it", never "licence not found".

## D-013 · Approval needs positive evidence

- **Decision:** the rules approve only when every check produced evidence: a registry record for the licence and PAN, a verified bank account, a matched selfie. An absence of problems isn't enough. A missing number means "retake", a missing selfie means "take one", and a reading that isn't confident goes to a person.
- **Came from:** F-005.

## D-014 · Only the rules engine's own decisions can be applied

- **Decision:** decide() registers and freezes each decision it makes; the onboarding service refuses anything else. The database handle is private, and the event and decision logs refuse updates and deletes at the database level.
- **Why:** "the AI can't approve" should hold even against a bug or an over-reaching tool, not just against a label.
- **Came from:** F-008.

## D-015 · The passbook photo is optional

- **Decision:** once the Rs 1 check has verified the account, a blurry or glary passbook photo doesn't block anyone. Hidden instructions on it still go to a person, and a readable passbook that names someone else still counts.
- **Why:** don't make drivers redo something that proves nothing new.

## D-016 · A third request for the same fix goes to a person

- **Decision:** if the same fix has already been asked for twice, the case goes to review instead.
- **Why:** an honest driver stuck on, say, an unusual name spelling shouldn't loop forever.

## D-017 · Only a verified fleet owner can vouch for a hired driver

- **Decision:** a hired driver can be paid into the owner's account only when that owner is a fleet owner, has passed KYC themselves, and is the one the driver named, and has confirmed them. New drivers always start unconfirmed.
- **Came from:** F-008.

## D-018 · Cheap checks before AI

- **Decision:** a classic image-check baseline (sharpness, brightness, blown-out pixels, shape) sits between "no reading" and the AI readers. Thresholds come from measuring the images (`npx tsx evals/photo-stats.ts`).
- **Why:** it shows exactly where AI earns its cost (screen photos, hidden instructions, reading printed names) and where it doesn't.
- **Came from:** F-009.

## D-019 · A holdout written by someone who never saw the code

- **Decision:** 16 extra cases, written by a separate AI agent from the policy documents only, with no access to the rules or tests. The main set is for building and tuning; the holdout isn't tuned against, and its numbers are the honest ones.
- **Came from:** F-011.

## D-020 · The gate is relative

- **Decision:** no bad case approved, and at most one good case missed. The one-miss tolerance is fixed, whatever the set's size.
- **Trade-off:** on a large set, one miss is stricter than any percentage. Revisit once a set has more than about 50 good cases.
- **Came from:** F-012.

## D-021 · Drivers never see why they were sent to review

- **Decision:** the driver app shows only "a person is checking", never the review reason. An API test checks that no review reason reaches the driver.
- **Why:** telling someone "we noticed the hidden instruction on your licence" teaches them to hide it better. Fix reasons are shown in full, because the driver needs them. A reviewer's note on a fix request is shown to the driver on purpose, and the form says so ("They'll see this").

## D-022 · One standard for photos, applied twice

- **Decision:** instant photo coaching and the rules call the same photo check. A driver hears "blurry, retake" the moment they take the photo, and the rules would say the same after submission.

## D-023 · The demo is seeded by running the real flow

- **Decision:** every demo persona gets their status by going through consent, photos, checks and the rules. Nothing is written straight into a status.
- **Why:** so every status, decision and log line in the demo was earned the same way a real one would be.

## D-024 · Scripted stand-ins until Phase 3, labeled as such

- **Decision:** the assistant's lines, the nudge writer and the case summary are templates; the document reader is a simulated perfect reader of SPECIMEN photos. The UI labels each one ("Assistant · scripted", "Nudge writer · templates", "Simulated reader"). Phase 3 swaps in AI behind the same interfaces.

## D-025 · The demo runs on its own clock

- **Decision:** the demo starts at Tue 29 Sep 2026, 10 AM IST, and moves forward on demand (+12 h, +2 days, +1 week), running the nudge cycle each time.
- **Why:** nudge timing (2-day limit, quiet hours) can only be shown by moving time.

## D-026 · A logistics theme, playful but never vague about trust

- **Decision:** a warm, tactile look inspired by joshwcomeau.com, translated into logistics: the road is the driver's progress (a truck drives along the KYC steps), loads are tickets that get a BOOKED stamp, nudges are dispatch labels. The keycap button follows the layered technique from Josh W. Comeau's public tutorial "Building a Magical 3D Button" (credited in the CSS). The artwork (truck, stamp, labels, confetti) is drawn in code for this project, and the sounds are synthesized. Two themes, "Morning depot" and "Night highway". Every font covers Devanagari.
- **Why:** KYC is anxious paperwork for a driver. A friendly, physical metaphor lowers the stress, and the demo is easier to remember.
- **Trade-off:** whimsy must never blur trust signals. The provenance chips (AI slot, rules, a person, simulated) stay plain and consistent in both themes.

## D-027 · Sounds off by default; motion follows the system

- **Decision:** sounds are synthesized in the browser (no audio files), off until switched on, and the choice is remembered per browser. Confetti, the driving truck and the other animations stop under "reduce motion".
- **Why:** surprise audio on a phone in public, or in an interview, is hostile. Motion can make some people ill.

## D-028 · Every "needs a fix" has a way out

- **Decision:** a driver asked for a fix can submit again. The rules check the new submission before any status changes, and a third identical request goes to a person (D-016). For an unconfirmed fleet owner, a demo button in the ops console stands in for the owner confirming the driver in their own app, labeled "Owner app simulated".
- **Why:** a status with no exit strands honest drivers.
- **Came from:** F-015.

## D-029 · UPS colours, with provenance kept apart from the brand

- **Decision:** the palette follows UPS's own web tokens, read from ups.com's style sheet on 29 Sep 2026: brown `#351c15`, the brown gradient `#7e5844` to `#69422d`, gold `#ffc400`, caramel `#c67d30`, and warm greys. Brown (caramel in the dark theme) is the everyday colour: keycaps, the truck, the road already travelled. Gold marks the main action on a screen (submit, book) and small highlights (the current step, the unread badge, a label's edge). It's the palette only: no UPS name, logo or shield in the product.
- **Rule that came with it:** warm colours are the brand; cool colours say who decided. "A person" moved from orange to UPS's link blue, because orange would have blended into brown and gold. AI stays purple, the rules stay green, simulated stays dashed grey. Confetti and progress use brand colours, never provenance colours. Blue and purple are hard to tell apart for some colour-blind people, so each provenance chip also carries an icon.
- **Guarded by:** `tests/theme.test.ts`. The two copies of the dark tokens must stay identical, every colour token the UI uses must be defined, and every colour pair the UI draws must meet WCAG AA in both themes: 4.5:1 for text, 3:1 for focus rings, borders and indicator lines. That includes hover and selected states and the translucent BOOKED stamp.
- **Why:** match UPS's look without blurring what the colours mean (D-026).

## D-030 · The decision rules are policy as code, on Open Policy Agent

- **Decision:** the rules live in `policy/kyc.rego` and run on Open Policy Agent (OPA). They're compiled to WebAssembly and run inside the app: no policy server, and the tests stay offline. TypeScript gathers the facts: what the reader saw, the registry answers, the name comparisons (name matching is an algorithm, so it stays in TypeScript) and the trust graph. The policy returns the outcome, reasons, checks passed and notices. The photo standard (D-022) is an OPA entry point too, so coaching and the decision still share one definition.
- **The contract around it** (`server/domain/rules.ts`) is still the only place a decision is minted (D-014), and it freezes every decision all the way down. It rejects an answer with an unknown code, a severity that differs from the catalogue, or an outcome that doesn't follow from its reasons. Whatever the policy says, an approval that lacks one of the five core checks, rests on an expired licence, or carries hidden instructions goes to a person instead. At startup it checks the policy's severity table and a test decision, so a stale build fails before any driver is decided.
- **How it was switched:** first, today's decisions were frozen: all 46 eval cases (naive and perfect readers) plus 45 hand-built edge cases, 137 decisions in all. The Rego port then had to reproduce the file byte for byte before the TypeScript rules were removed. It did, first try. That v2 file is kept (`tests/snapshots/policy-decisions.v2.json`). The live file (`tests/snapshots/policy-decisions.json`) reviews every policy change: `npm run policy:diff` lists exactly which cases changed, and a test pins the 13 that v3 changed.
- **Found after the switch (audit):** the snapshot only held well-formed inputs. A reading with no quality field, or an empty registry name, was approved by the port though the old code sent it to a person. Now missing fields fail closed in both the facts and the policy, and approval needs all five core checks passed (licence valid, PAN found, same person, bank verified, selfie match). The reviewed decisions didn't change.
- **Guarded by:** `npm run policy:test` (the Rego tests, one or more per product decision), `tests/policySnapshot.test.ts`, `tests/policy.test.ts` (the compiled policy must match the Rego source, and the policy and the reason catalogue must agree on every code), and `tests/rules.test.ts` (a deliberately broken fake policy can't get past the contract).
- **Why:** compliance rules that someone other than the app developer can read, diff, test and change, with every decision stamped with the policy version that made it.
- **Trade-off:** a second language (Rego) and a build step. The compiled policy is kept in the repo, so running the app needs no OPA install; changing the policy does.

## D-031 · The eight policy questions, settled (policy v3)

I went with the recommendations. Each answer is a named test in `policy/kyc_test.rego`.

| # | Question | Decided | Where |
|---|---|---|---|
| 1 | Paid into the account of a fleet owner who hasn't passed KYC | New fix reason: the owner must finish their own KYC first | `OWNER_NOT_VERIFIED` |
| 2 | Paid into the account of a named "owner" who runs no fleet | Asked for an account in the driver's own name: there's no fleet to confirm | `BANK_NAME_MISMATCH` |
| 3 | Licence on its last day; minimum remaining validity | Valid through its last day, no minimum. Inside 30 days, ops sees a notice and the driver gets one renewal reminder per licence (needs a licence date the rules verified) | `LICENCE_EXPIRES_SOON`, `kyc/renewal` |
| 4 | Dark, cropped or missing optional passbook photo | Ignored once the Rs 1 check passes (unchanged) | D-015 |
| 5 | One-word name vs. full name | Matches only a name plus initials (unchanged; lives in the name matcher) | `tests/names.test.ts` |
| 6 | Expired licence fetched through DigiLocker | Still "licence expired" (unchanged) | `DL_EXPIRED` |
| 7 | Named owner unverified, but paid into the driver's own account | Approved, with a notice for ops that the owner link isn't verified | `OWNER_LINK_UNCONFIRMED` |
| 8 | A reviewer asks for a fix | The reviewer picks the step to redo; the driver's app opens there | `REVIEWER_FIX` |

- **Holdout effect:** questions 1 and 2 came from holdout cases H12 and H13. H13 now matches its author's expected reason; H12 doesn't, because question 1 was decided differently from that author's reading. Since both cases shaped the decision, their reason codes no longer count as unseen evidence. Outcomes were already right on all 16.
- **Also in v3:** a reader confidence above 1 is treated as broken, not as extra sure (F-019).
- **Demo:** Priya Sharma (a main-set case, licence valid for 19 more days) joined the demo cast to show the renewal reminder.

## D-032 · Question 9: a lapsed licence locks bookings (policy v4)

- **Decision:** a licence is valid through its last day. From the next day, an approved driver moves to a new status, `LICENCE_EXPIRED`, and the existing bookings lock (open only for approved and active drivers) does the rest. The driver's app asks for the renewed licence only; they resubmit and the rules check everything again. The status machine keeps exactly two ways into "approved".
- **How it runs:** the policy says when a licence lapses (`kyc/renewal`). Each clock tick (a daily job in production) moves lapsed drivers, and a booking attempt checks too. Reminders follow the normal limits.
- **Demo:** fetching the licence from DigiLocker returns a renewed one, as if the driver had renewed at the RTO (SIMULATED). With a lapsed licence, the app offers DigiLocker only: the demo camera only has the old card.
- **Edges (audit):** a reviewer can't approve a case whose licence the registry says has expired. Fix requests from before an approval no longer count toward the repeated-fix rule. Known gap: a driver a person approved without a registry date (licence not found, checked by hand) isn't tracked for expiry.
- **Guarded by:** `policy/kyc_test.rego` (question 9), `tests/status.test.ts`, `tests/nudges.test.ts`, `tests/api.test.ts` (Priya: lapsed, locked, renewed, booking again).

## D-033 · OpenRouter only

- **Decision:** every model call goes through OpenRouter: Claude Opus 5.5 as the baseline reader, and open-weight challengers for the comparison. Crusoe is dropped: it needs a credit card on file.
- **Why it's enough:** OpenRouter's public model list (read 29 Sep 2026) has Claude Opus 5.5, Sonnet 5.5 and Haiku 4.5, and 62 paid open-weight models that read images (Qwen, Gemma, Mistral and others; 53 of them take the structured output the reader needs), so the closed-vs-open comparison survives with one key and one bill.
- **Trade-off:** one vendor between us and every model. The model router's interface keeps that swappable, and OpenRouter's data-retention settings apply to every call.

## D-034 · The demo UI assumes an informed viewer

- **Decision:** no explanatory copy in the UI: no taglines, legends, how-to notes or orientation labels. The small provenance and SIMULATED chips stay, because they're facts about the data, not instructions. Evidence behind a reason moves to hover.
- **Why:** the people using the demo already know the product. Every extra sentence competes with the decision on screen.

## D-035 · The AI document reader is measured before it reads for a driver (Phase 3)

- **Decision:** the AI reader is built and runs in the eval harness first, through the same policy and gate as every other reader. The app keeps the simulated reader (D-024) until a model passes the gate on both sets; then it switches behind a setting.
- **How it reads:** one photo in, one reading out. The model sees only the photo: not the slot it was uploaded to, not the number the driver typed, so it can't be steered into agreeing with either. Its answer must fit a strict JSON schema (document type, photo quality, photo of a screen, fields, hidden text, confidence), at temperature 0. An answer off the schema is refused, never read as fine: the evals count the case as unanswered, which fails the gate, and in the app it will count as an unreadable photo. Text on a document is data: anything aimed at the verification is copied into the reading as evidence, and the policy sends the case to a person (C27).
- **Where it lives:** the prompt, the schema and the parsing are pure code in `server/ai/documentReader.ts`, so the AI zone still can't reach the store or an approval (`tests/boundaries.test.ts`). The network call is `server/adapters/openrouter.ts` (D-033): it asks for providers that don't keep prompts, retries rate limits and server errors, stops at a spending budget, and never logs the key.
- **The comparison:** `npm run evals:bakeoff` runs five models side by side on both sets: Claude Opus 5.5 (the baseline), Claude Sonnet 5.5, Claude Haiku 4.5, and two open-weight models, Qwen 3.8 27B and Gemma 4 31B, with one shared budget ($6 by default). At the budget the run stops: finished models keep their results and the rest are marked stopped. No credit or a refused key stops it with no table written. It writes `evals/results/BAKEOFF.md`: bad cases approved on each set, good cases approved, the gate, cost per 1,000 photos, seconds per photo and unanswered cases.
- **Condition before real documents:** the prompt says SPECIMEN notices are expected, because every test photo carries one, but only a line that says nothing else: a notice that also talks about approval or checks is copied as hidden text. That line comes out before the reader sees a real document. C31, a bad case whose injected text poses as a specimen notice, was added before the comparison ran, and every model caught it.
- **Results (29 Sep 2026, $3.48, `evals/results/BAKEOFF.md`):** Opus, Sonnet and Gemma got every case right on both sets, outcome and reason (the one exception, holdout H12's reason code, is the known disagreement the perfect reader shares). Gemma cost $0.10 per 1,000 photos, Sonnet $6.74, Opus $13.74. Haiku passed the gate, but misread three licence numbers, which sent those cases to a person, and gave four wrong reasons. Qwen failed on one photo that timed out, a client bug since fixed (F-024). The app now reads with Gemma (D-038).

## D-036 · The architecture is a C4 model, drawn with drawing-office

- **Decision:** the decided workflow is modelled in `architecture/agent-kycready/workspace.dsl` (Structurizr DSL) to the conventions of drawing-office (github.com/devpath56/drawing-office, a third-party toolkit): violet is ours, green isn't, and a box we're changing carries its state on its stroke and in words. Modified: the document reader and the nudge writer (a stand-in fills the seat), and the API server and the system that hold them. Proposal: the trust graph on Neo4j (Phase 5). Each change carries its reason as a decision record inside the model, eight now; the system and the API server are marked because they hold the changed boxes. Since then (D-038, D-039) the reader and the trust graph are built, and only the nudge writer carries a delivery state. Nine views: context, containers, the API server's components, and six traces (onboarding, a fix and the way out, a case a person decides, a lapsed licence, and inside the API server, a decision and a nudge cycle). The registries, the push notification and the marketplace are marked simulated, as in the demo.
- **Two modelling choices:** a push notification goes to the driver, the person whose phone shows it, not into the driver app; and the driver's two uses of the app (KYC, booking) are two relationships. Both say what happens. Both also keep Graphviz from folding the diagrams into two columns: it breaks the loop a push closes (API server, driver, driver app, API server) by turning the lighter arrow around.
- **Commands:** `npm run c4` stamps the palette from `architecture/theme.json`, exports with structurizr-cli in Docker and writes the traces' step frames; `npm run c4:check` runs drawing-office's 15 checks on the model: 10 find something to judge and pass, and 5 have nothing to check here (no perspectives, message queues, worked examples, build stages or control tables); `npm run c4:serve` serves the viewer; `npm run c4:page` writes the self-contained page that gets shared. The image is pinned to `structurizr/cli:2025.11.09`, the last one that ships the CLI and Graphviz ("latest" is now only a notice that the project moved).
- **Found in drawing-office:** its build stamps its own palette rather than this repo's when pointed at another repo, and its server, given a repo, serves every file in it (`.env` included) to the whole network. `scripts/c4.ts` runs the build steps itself and serves `architecture/` only, to this machine. Not reported upstream yet.
- **Our palette edits:** relationships are solid by default, so a dashed line means asynchronous; the Deployment Node row is gone, since this model has no deployment view. drawing-office's own `check` reports our theme as different from its package copy: that's these two edits.
- **Why:** the decisions were spread across this file, the PRD and the code. A checked model puts structure, flows and reasons in one versioned place, and its checks catch a changed box nobody labelled or a proposal with no reason. They judge the drawing, not whether it matches the code: the traces were walked against the code by hand.
- **Trade-off:** rendering needs Docker and a clone of drawing-office in `tools/` (git-ignored). The model itself is plain text.
- **Not redistributed (29 Sep):** drawing-office has no license, so its viewer and palette aren't in this repo; `npm run c4` copies them in from the clone, with this model's two palette changes applied in `scripts/c4.ts`.

## D-037 · Liquid glass on the navigation layer, and accessibility built in

- **Asked for:** the liquid glass look of [gooey](https://github.com/duanebester/gooey). Gooey is a Zig GPU framework, and its liquid glass is a macOS 26 window effect, so it can't run in a React page. The look is recreated in CSS instead, and gooey's accessibility practices come with it.
- **Where glass goes:** only the navigation layer, as Apple's own Liquid Glass guidance puts it: the demo bar, the phone's top bar and a floating capsule tab bar, the camera sheet and the toast. Content stays solid, and nothing glass sits on glass: the language switch and the ops tabs are wells with a solid pill for the selection.
- **Legibility is a test, not a hope:** the tint is 85%: of the tints tried (72 to 85%), the first at which every text colour that sits directly on glass passes WCAG AA over a black backdrop (light theme) or a white one (dark theme), so whatever scrolls beneath can't make a label unreadable. Error text and SIMULATED chips, which wouldn't pass there, sit on their own solid ground inside a glass bar. Muted grey never sits on glass. The selected tab uses brown in the light theme and gold in the dark one, since caramel on dark glass fails. `tests/theme.test.ts` checks all of it.
- **Fallbacks:** solid bars when the system asks for less transparency, in high-contrast mode, and in browsers that can't blur. Anything fixed-position stays out of a glass bar, which would trap it (F-021).
- **Accessibility, from gooey's checklist:** tabs follow the ARIA pattern (arrow keys, Home and End, one tab in the tab order, a labelled panel) in the phone and the ops console; the camera sheet is a modal dialog (focus moves in and back, Tab stays inside, Escape closes it); the unread count is spoken ("Inbox, 1 unread"); the demo bar's error is announced; the page has one top-level heading. Colour is still never the only cue (D-029).
- **Why:** a calmer, more native-feeling surface for an informed viewer (D-034), without trading away contrast or keyboard use.

## D-038 · The app reads photos with Gemma 4 31B, and Claude Sonnet when Gemma is slow or fails

- **Decision:** chosen by the comparison (D-035): Gemma 4 31B, an open-weight model, got every case right at $0.10 per 1,000 photos. The app's photo step reads with it through OpenRouter, asking for its fastest provider, and asks Claude Sonnet 5.5 when Gemma is slower than 15 seconds or fails. No credit, a refused key or a spent budget stop the read, since Sonnet would fail the same way. `READER=simulated` keeps the stand-in; `READER_BUDGET_USD` caps spend per server run ($1 by default).
- **What the driver sees:** a photo takes about 10 seconds. One nobody could read stores nothing and says "try again"; it's never taken as a good photo.
- **Provenance:** every document records who read it. The ops console shows "Gemma 4 31B", or "Claude Sonnet 5.5 · fallback" with the reason on hover, where it showed "Simulated reader".
- **Cost:** the same photo is read once per server run. The seeded demo cast is still read by the stand-in, so starting or resetting the demo calls no model.
- **Why 15 seconds:** Gemma answered in 8 to 13 seconds on 29 Sep, whichever provider OpenRouter picked. In a timed sample at 10 seconds, Sonnet read 3 of 6 photos, at about 70 times the cost.
- **Sonnet's own limit:** 30 seconds, added after the audit on 29 Sep, so a driver waits at most 45 seconds before being asked to try again; a retry's backoff also ends the moment Gemma is given up on.
- **Measured as shipped** (`npm run evals -- --reader=app`): holdout 0 of 10 bad cases approved, 6 of 6 good, nothing unanswered; Sonnet read 6 of 47 photos; 8.7 seconds a photo, counting only the model that answered; $0.045. Main set: the first run lost one photo when both models were rate-limited (F-024); after the fix, 0 of 21 bad cases approved, 10 of 10 good, every outcome and reason right, nothing unanswered; Sonnet read 7 of 91 photos; 6.7 seconds a photo, counted the same way; $0.056. Both sets pass the gate. (An earlier run, since overwritten by D-040's; the wait for a slow Gemma wasn't in those times, and D-040 counts it.)
- **Found on the way:** the prompt's examples of hidden text used the same words as the test documents, so catching C27, C28 and C31 proved nothing about new wording. The examples are reworded, and the numbers above were measured after.
- **Before real drivers:** a round of real phone photos of printed SPECIMEN cards (`evals/specimens/phone-photos`: 21 photos of 8 cards, `npm run evals:phone`), and the prompt's SPECIMEN allowance comes out.

## D-039 · The trust graph runs on Neo4j, and no answer sends the case to a person (policy v5)

- **Decision:** Phase 5. Neo4j Aura Free holds drivers, bank accounts and fleet owners; a `world` property keeps the demo and each eval set apart. The adapter uses Neo4j's HTTPS Query API, so there's no driver package. Each check brings the graph up to date with the platform, then asks who else is paid into the account. What a shared account means stays in one TypeScript function that both graphs use.
- **Fails closed:** the graph now says whether it answered. Policy v5 adds `GRAPH_UNAVAILABLE`, a reason for review: no answer is never read as "no shared account". The contract refuses an approval without an answer too. v5 changed none of the 139 recorded decisions; the snapshot gained one scenario.
- **Proof:** `npm run graph:parity` decides every eval case on both graphs: 94 of 94 decisions identical (both sets, two readers).
- **In the app:** Neo4j when `.env` has an instance (`GRAPH=memory` opts out), with a connection check at start. The seeded cast is decided in memory, which the parity check shows decides alike; live checks and the ops console's case view use Neo4j, and the case view says so.
- **Trade-off:** a hosted database and a network hop, about 0.15 seconds per check (the parity run: 94 checks in 14.5 s). The Free instance pauses after three days without writes, and the demo's checks write; while it's paused, cases go to a person.
- **Re-checked (29 Sep):** after adding uniqueness constraints on drivers and accounts and limiting "who else is on this account" to drivers on the platform now, `npm run graph:parity` still gives 94 of 94.

## D-040 · The reader reports signs of editing, and an edited document goes to a person (policy v6)

- **Why now:** the registry and face checks see records, not the card. In this demo the face match compares the selfie with the registry's photo, so a card patched with a real person's details already fails it. The reader's signs would matter where a registry holds no photo and the card's own portrait is compared instead, which this demo doesn't model. Only the photo shows the edit.
- **Decision:** the reader's answer gains `tamperSigns`: what it sees that looks edited (a field in another font or weight, text on a mismatched patch, a pasted or blended portrait), or nothing. A watermark, a specimen notice, glare, blur or a photo of a screen aren't signs. Policy v6 adds `DOCUMENT_TAMPERED`, a reason for review, and the contract refuses to approve a document that looks edited. A report sends the case to a person; it never rejects anyone.
- **Measured on IDNet** (`npm run idnet:fetch`, then `npm run evals:idnet`): 30 synthetic South Dakota driving licences from the public-domain IDNet dataset (Xie et al., IEEE BigData 2024), each genuine and under four forgeries. **The app's reader barely notices them.** It reported 15 of 120 forgeries and 2 of 30 genuine licences as edited ($0.17, `evals/results/IDNET.md`), but only reports that cite a visual sign of editing count, and nearly all of those came from the fallback. Portraits replaced: 1 of 30 reported.
  - **Gemma** (133 of the 150 images): all 8 of its reports name the height field. Seven find the height itself implausible (7 ft 10 in, a quirk of the synthetic data, printed on genuine cards too) and one says it's set in a different weight: one sign of editing in 104 forgeries, and 2 of 29 genuine licences reported. No signal.
  - **Sonnet** (the 17 images Gemma was slow on: 16 forgeries, 1 genuine): 9 forgeries reported, each citing a visual sign. On the text edits it points at the real one, replaced fields set in a lighter weight than the rest (checked against the images); several reports also cite the red licence number and date of birth, which is the template's design. With one genuine licence read, its false-alarm rate is unmeasured.
  - **Pairing isn't the answer either:** counting a forgery only when the same licence's genuine copy wasn't reported gives 10, but that still includes two of Gemma's height remarks and drops two of Sonnet's real catches (F-026). The per-model reading above is the result.
  - **What it means:** the rule is a safety net for edits the reader happens to see, not a forgery detector. Catching forgeries needs dedicated checks (a template's security features, the card's portrait against the registry's), and a Sonnet-only run would show whether a stronger reader is worth its cost.
- **Measured on our own cases** (the app's reader, v6, after its fallback got a deadline): main set 0 of 21 bad cases approved, 10 of 10 good, every outcome and reason right; holdout 0 of 10 and 6 of 6, every outcome right, H12's reason the known exception (D-031); nothing unanswered. Neither of our own edited cards was reported as edited (C26's licence, H15's PAN: 0 of 2); both still go to a person, on the registry mismatch. On these sets v6 adds a reason, never an outcome. Counted from the start, a slow Gemma's wait included, a photo took 8.5 s on the main set and 9.1 s on the holdout. Sonnet read 5 of 91 and 6 of 47 photos; $0.09 in all, $0.68 per 1,000 photos. The 11 Gemma calls cut off as too slow aren't priced; at Gemma's price, about a tenth of a cent.
- **What changed in the rules:** v6 changed 2 of 140 recorded decisions, both cases whose pasted name the perfect reader now reports as editing (C26, H15); both still go to a person.
- **Sample, not the dataset:** IDNet is 4.87 GB for this state; the fetch reads the archive's table of contents and downloads only the 150 chosen images, about 17 MB, which stay out of git.
- **Limits:** the licences are American, and the prompt is written for Indian documents; this measures only whether the reader notices editing.

## D-041 · Provenance as small markers, not coloured bands; each message said once

- **Why now:** Isha, looking at the demo: the blue, green and purple bands were loud, and the screens were still too wordy. The colours marked who produced what (purple an AI slot, green the rules, blue a person) by filling whole boxes, bubbles and chips, and the same message often appeared two or three times on one screen.
- **Colour:** a marker only. A provenance chip is neutral with its icon in the source's colour, a reason gets a thin accent line, chat bubbles share one grey with a coloured label saying who wrote them, passed checks are a plain ticked list, and the account graph is outlined. Amber and red keep their meaning for a fix and a rejection; the small status pills keep their colour.
- **Said once:** the phone's status is the pill in its header and the message in the chat; the banner that repeated both is gone, and several fixes arrive as one message, one per line. The ops summary is one line, only when something needs explaining, and takes the place of each reason's own message (which moves to hover, with the evidence); a sentence that applies to two documents is said once, naming both.
- **Plain labels:** "All drivers" for "Why?", "Who uses this bank account" for "Trust graph", "Card doesn't match registry" for "Printed vs registry"; timeline entries use status names, not codes; passed checks keep their facts as words ("Licence valid till 2038-04-13", "Paid into the fleet owner's account"). The Tests tab has one row per reader with both case sets added up (each set on hover), its readers grouped (the app's, the AI models compared, the ones without AI), the pass rule in one line above it, the cost per 1,000 photos, and a result that says why it failed: Qwen's one unanswered photo, which made a 0-of-21 row fail with no visible reason, now shows. The Funnel tab lost its thick striped bars: a slim bar per stage with its count, its share of sign-ups and the drop-off from the step before (the biggest one marked), and each card says what it's out of ("5 of 7 decisions", "6 nudges, 3 approved"). All drivers lost its dropdown for the review queue's layout: every driver in a list, the ones who need someone first, each with a status and where they are ("Next: Licence", "Can book loads"), the case beside it with "Their phone"; on a phone the list is a strip to swipe.
- **Markers kept, merged or dropped:** the AI, rules and person tags and every SIMULATED chip stay (D-034). The per-check "simulated" tags became one "Simulated checks" chip on the decision, and the decision form's "A person decides" tag went: the form is the person. The contrast tests now also cover the coloured labels on grey and the accent lines, and a reason's severity is spelled out for screen readers.

## D-042 · A preserve-mode polish, run through an outside design audit (tasteskill)

- **Why now:** after D-041, the demo was checked against an outside rulebook: tasteskill v2's redesign protocol, read from its SKILL.md. The flow audits first, declares a mode, and only then changes what the audit found.
- **Mode:** preserve, as targeted evolution: typography, spacing, colour and motion (its levers 1 to 4). No new first screen and no block replaced. URLs, navigation labels, form fields, the logo and the consent copy are unchanged.
- **Changes:** one type scale (seven steps) and one spacing scale as tokens; one shape rule (a pill for buttons, chips, tabs and toggles, 14px for cards and panels, 8px for small inner pieces); section headings and table headers in sentence case, leaving the nudge label as the one uppercase label; tables separated by space, with one soft divider between groups; one easing curve and three durations, the spring kept for the playful moves; a press on clickable cards; loading shapes instead of "Loading…"; no em-dashes (four empty-value dashes became "n/a" or a blank); the keycap shadow tinted to the page; funnel bars without a track, in the brand primary; heights in dynamic viewport units; a page description and a link preview card (`public/og.jpg`, built from the demo screenshot `docs/demo.jpg` by `npm run og`; since 29 Sep it's also the README's picture).
- **Kept on purpose:** Lucide icons (switching adds a dependency), the hand-drawn truck, road, stamp and logo (D-026), and the specimen silhouettes and "+91 00000" numbers (D-005).
- **Checked:** no em-dash in the source or on any of the eight views; the audit's pre-flight list (its landing-page items don't apply to an app); no URL, label, field or anchor changed; the gold accent, the type stack and the logo unchanged; 189 tests and the contrast checks.

## D-043 · Outside components from 21st.dev, reused or rewritten according to their licences

- **Asked for:** Isha picked four 21st.dev components (Background Paths from Kokonut UI, Liquid Glass Button, Scroll Choreography, Streaming Text), then asked for the story's cards to move like Hyperiux Vault's Cards Rotate Slider.
- **The licence decides how:** 21st.dev lists a licence for each. Background Paths is MIT, so it's ported from Kokonut UI's public GitHub source: the same generated wave paths, moved by CSS instead of motion/react and drawn in the theme's warm tones. Its notice is in `THIRD-PARTY-NOTICES.md` and in a comment the build keeps in the shipped bundle. Liquid Glass Button lists no licence, and Scroll Choreography and Streaming Text say "no licence", so none of their code is copied; each is written for this app from what it does. The Cards Rotate Slider is MIT, but its code isn't used either: it runs on GSAP, and plain CSS does the same here. No new dependency.
- **Where each one goes:**
  - **Background paths:** faint routes behind the demo page. The whole drawing drifts as one layer, so the browser moves it without repainting; it holds still under reduced motion and is gone in high-contrast mode.
  - **Streaming text:** the case view's AI summary arrives word by word, then settles into text with a numbered citation per sentence. `caseSummaryParts` returns each sentence with the reasons it came from (tested). A citation opens "Sources", the decision's reasons with their evidence, and moves focus to the one it names. New chat replies on the phone stream too. The box takes its final size at once, citations included, so nothing below it jumps and the chat stays at its end. Screen readers get one copy of the whole text that stays put when the stream ends, so the chat's live region speaks it once. Reduced motion shows the text at once, and a text that has streamed to the end once shows at once after that, until the page reloads.
  - **How it works:** a section below the demo, told in four cards (Nudge, Read, Decide, Unlock), each a screenshot of the seeded demo with a one-line caption. Scrolling pans the track: each card turns in from the right, sits flat in the middle, then turns away to the left. It's scroll-driven CSS. Without scroll-driven animation, under reduced motion or on screens narrower than 761 px, the cards sit in a plain grid.
  - **Liquid glass buttons:** the section's step buttons (1 to 4), which jump to a card and mark the one in the middle. They sit on the page itself, below the cards, where the lens has the page and its background paths behind it. A first version put them on the demo bar, which is glass itself: a backdrop filter nested inside another has nothing behind it to show, and D-037 keeps glass off glass. The bar has its old buttons back. The frost works in every browser that blurs; the lens, an SVG displacement filter, only in Chromium. Their tint is tested like the bars': the number stays readable over a black or white backdrop in either theme.
- **Replaced on the way:** the first story flew four pictures in from the screen's corners into a grid, then opened a picture of the whole demo. Isha: "doesnt make much sense". Mid-scroll, it was four tilted pictures stranded in the corners around an empty middle. The card track always has one card flat in the middle.
- **Layout:** the demo keeps its one-screen layout; the page now scrolls on past it into the story. Scrolling to the end of a panel carries on into the page, as on any web page; containing it would hide the story from anyone who didn't scroll the page's edge.
- **Motion:** D-027 holds: everything that moves is decoration, and reduced motion stops all of it. There's more of it than D-041 left, most of it in the story section, where it's the point.
- **Pictures:** `public/story/` holds four screenshots of the seeded demo, taken with headless Chrome (156 KB in all). They need re-taking when the screens they show change.
- **Checked:** 191 tests (two new: the summary's citations and the glass buttons' contrast), the contrast checks, typecheck and build; the story in both themes, with and without reduced motion, at desktop and phone widths; a citation opening its source; a streamed reply keeping its size and its single screen-reader copy; no em-dash in the source.

## Policy questions (settled in v3 and v4)

Places where the written policy didn't settle the outcome. The holdout author (D-019) found 1 to 7, the theme audit found 8, and building question 3 found 9.

| # | Question | Behaviour before v3 | Decided |
|---|---|---|---|
| 1 | A hired driver is paid into the account of an owner who hasn't passed KYC | Ask for a fix: "ask your fleet owner to confirm you" | The owner must finish their own KYC first |
| 2 | A hired driver names someone who isn't a fleet owner, paid into their account | Same as #1 | "Use an account in your name": there's no fleet to confirm |
| 3 | Is a licence valid on its last day? Is there a minimum remaining validity? | Valid through its last day; no minimum | Kept, plus a renewal reminder inside 30 days |
| 4 | A dark or cropped optional passbook photo; no passbook photo at all | Ignored once the Rs 1 check passes | Kept |
| 5 | A one-word name vs. a full name | Matches only a name plus initials ("Kavitha" and "Kavitha M") | Kept |
| 6 | An expired licence fetched through DigiLocker | Still "licence expired" | Kept |
| 7 | A hired driver names an unverified owner but is paid into their own account | Approved: the owner link only matters for payouts to the owner | Kept, with a notice in the ops console |
| 8 | A reviewer asks for a fix | The note reaches the driver, but the phone restarts at the licence step | The reviewer picks the step to redo |
| 9 | An active driver's licence actually expires (found while building question 3) | Nothing changed: they could still book | Bookings lock from the day after; a renewed licence goes back through the rules (D-032) |
