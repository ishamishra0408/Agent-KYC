# Agent KYCReady: PRD

v0.1 · 2026-09-28 · Owner: Isha Mishra

## Problem

Drivers and fleet partners sign up, then stall before finishing KYC, so supply that has already been paid for never takes a load.

The flow I owned at a logistics marketplace: push every driver with incomplete KYC on a fixed 2-day timer; OCR marks documents approved or pending; approved drivers can book.

Where that leaks (hypotheses from experience, not measured here):

- Every stuck driver gets the same reminder, whatever the reason they're stuck.
- Forms and photo uploads fail low-literacy users on low-end phones.
- OCR reads text but can't judge whether a document is real, so too much lands in "pending".
- A bare "pending" gives the driver nothing to do.
- Approval isn't the goal. The first trip is.

## Users

| Who | Situation |
|---|---|
| Owner-driver | Own vehicle, own bank account |
| Fleet owner | Several vehicles; confirms the drivers they hire |
| Hired driver | Drives an owner's vehicle; may be paid into the owner's account |
| Ops reviewer | Decides the cases rules can't, with the evidence in front of them |

## The bet

Give each driver an onboarding agent that knows why they're stuck, talks in their language and coaches their document photos, while plain code and people make every approval. More signups will reach a first trip, faster, with no rise in bad approvals.

## Metrics

| Metric | Definition | Where it's measured |
|---|---|---|
| **North star: 7-day activation** | Share of signups with a first completed trip within 7 days | Real launch only |
| **Hard gate: bad approvals** | Bad submissions approved, on the test set | Test set: must be 0 (21 bad cases today) |
| Good approvals | Good submissions approved, on the test set | Test set: at most 1 good case missed |
| Time to approval | Signup to approved | Demo, then real launch |
| Decided without a person | Share of cases the rules settle alone | Test set, then real launch |
| Messages per activated driver, opt-outs | Nudge load and fatigue | Simulation, then real launch |
| Cost per activated driver | AI + registry checks + reviewer minutes | Estimated, then real launch |

## Principles

1. **AI proposes, code decides, people decide the hard cases.** The AI has no path to "approved". The status machine enforces it and a test proves it.
2. **Tests before prompts.** The test set and its gate existed before any model code.
3. **Registries are the source of truth**, not photos.
4. **Fail closed.** Low confidence goes to a person.
5. **Waiting on us means a status update, never a reminder.**

## Scope

| In (v1) | Out (non-goals) |
|---|---|
| Driver app: inbox, chat, photo coaching, status, loads | Real registry integrations (all SIMULATED) |
| Ops console: review queue, all drivers, nudges, funnel, tests | Real WhatsApp or SMS |
| Decision policy (OPA), send gateway, bookings lock | Payments and trip tracking |
| Test set and model comparison | Real ID documents |
| Trust graph (fraud ring vs. real fleet), voice notes | Production deployment and compliance sign-off |

## Risks

| Risk | Mitigation |
|---|---|
| The model misreads a field | The registry decides; unclear photos fail closed |
| Hidden instructions inside a document | The AI has no approve tool; injection cases are in the test set |
| Unfair rejections of regional name spellings | Transliteration-aware name matching; nothing auto-rejects, and a fix asked for twice goes to a person |
| Honest fleets flagged as fraud | Owner-link rule; ring vs. fleet in the graph |
| Generated test images are cleaner than real photos | Printed specimens photographed on a phone (Phase 3) |
| Privacy (India's DPDP Act) | Fake data only; a real launch needs consent, retention limits, and no raw images in logs |

## What's simulated

Registry checks (DigiLocker, licence, PAN, bank, face match), the fleet owner's confirmation, the loads, the driver population, and notifications. Every simulated check and integration is labeled SIMULATED in the product. The demo phone itself, inbox included, is a stand-in throughout.
