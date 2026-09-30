# Agent KYCReady

## [Open the live demo →](https://agent-kycready.onrender.com)

**Drivers sign up on a logistics marketplace, get stuck at KYC, and never book a load. Agent KYCReady gets them verified: it tells each driver the one thing blocking them, reads their documents, and lets a policy decide, NEVER the model. Ops would only see the hard cases.**

**Live:** [demo](https://agent-kycready.onrender.com) · [ops console](https://agent-kycready.onrender.com/#/ops) — no login, nothing to install. It runs on stand-ins for the AI reader and the graph, and the first visit can take a minute to wake up.

[![Agent KYCReady: driver KYC, rebuilt AI-first. A model reads the documents, a policy decides, people decide the hard cases. Beside it, the demo: a driver's phone with a licence renewal reminder, and the ops console with a case sent to a person because a bank account is shared with strangers](public/og.jpg)](https://agent-kycready.onrender.com)

## Who it's for

| | Before | With Agent KYCReady |
|---|---|---|
| **Drivers** | The same reminder every two days, with no hint of what's wrong | One message about their actual blocker, a bad photo caught as they take it, and bookings open the moment they pass |
| **Ops reviewers** | A pile of "pending" with no reasons | Only the hard cases, each with its reason and the evidence |
| **The marketplace** | OCR that can't tell a photo of a screen from the card, and expired licences that keep booking | No model can approve anyone, shared-account fraud goes to a person, and a lapsed licence locks bookings |

## How it works

1. **Nudge** — one message about the driver's blocker, at most every two days, never at night.
2. **Read** — an AI model (Gemma 4 31B, with Claude Sonnet as backup) turns each photo into fields and flags.
3. **Decide** — a policy in Rego approves, asks for a fix, or sends the case to a person, always with a reason.
4. **Unlock** — approved drivers add their vehicle and can book once the vehicle policy approves it; a lapsed licence locks them again.

## Architecture

![C4 container diagram. The driver app and the ops console call the API server, the only place a driver's status changes. It stores everything in SQLite, asks the Neo4j trust graph who shares a bank account, asks OpenRouter to read document photos, and calls the identity registries and the load marketplace. The eval harness runs the same policy and checks the graph.](docs/architecture.svg)

Violet is this system; green is people and outside systems (the registries, the marketplace and push notifications are simulated). Every status change goes through the API server; the AI reader and the trust graph only supply evidence. Drawn from the [C4 model](architecture/agent-kycready/workspace.dsl), which also has the API server's components and six traced flows.

## Does it work?

| On 47 made-up test cases | Bad cases approved | Good cases approved |
|---|---|---|
| No document reading (the old way) | 12 of 31 | 16 of 16 |
| **Agent KYCReady** | **0 of 31** | **16 of 16** |

The 47 are a main set of 31 and a holdout of 16 written by someone who never saw the code; across both, 31 must be stopped and 16 are honest drivers.

Five AI models were compared on the same cases. The open-weight Gemma got every decision right, as Claude Opus did, at $0.10 per 1,000 photos against $13.74. The weak spot is forged documents: on public IDNet forgeries, the reader rarely spotted the edits. [How the tests work](evals/README.md) · [the model comparison](evals/results/BAKEOFF.md)

## Key trade-offs

| Decision | Chose | Over | Cost we accepted |
|---|---|---|---|
| Who approves | The model reads and flags; a policy decides ([D-001](DECISIONS.md#d-001--ai-proposes-code-and-people-decide)) | The model approving above a confidence threshold | Rules need upkeep, and what they can't settle goes to a person, not to the model |
| When to approve | Only with positive evidence from every check ([D-013](DECISIONS.md#d-013--approval-needs-positive-evidence)) | "No problems found" | More cases reach a person, for example whenever the trust graph can't answer |
| Making "AI can't approve" hold | Only decisions the policy minted can be applied; the logs refuse edits ([D-014](DECISIONS.md#d-014--only-the-rules-engines-own-decisions-can-be-applied)) | A label or a convention | A contract layer between the policy and the database |
| Where the rules live | Rego on Open Policy Agent, compiled to WebAssembly and run in-process ([D-030](DECISIONS.md#d-030--the-decision-rules-are-policy-as-code-on-open-policy-agent)) | Rules in TypeScript, or a policy server | A second language and a build step. Switched only after it reproduced 137 recorded decisions exactly |
| Which model reads | Gemma 4 31B; Claude Sonnet after 15 s or on failure ([D-038](DECISIONS.md#d-038--the-app-reads-photos-with-gemma-4-31b-and-claude-sonnet-when-gemma-is-slow-or-fails)) | Claude Opus for every photo | About 9 s a photo instead of 3 s, for $0.10 instead of $13.74 per 1,000 photos, with the same decisions |
| How models are reached | OpenRouter for every call ([D-033](DECISIONS.md#d-033--openrouter-only)) | Each vendor's own SDK | One vendor between us and every model, kept behind an interface |
| When AI ships | Only after passing a gate on 47 cases, holdout included ([D-035](DECISIONS.md#d-035--the-ai-document-reader-is-measured-before-it-reads-for-a-driver-phase-3)) | Tuning prompts inside the app | A slower start, paid back when the gate caught a client timeout bug ([F-024](FAILURES.md)) |
| Fraud rings | A trust graph on Neo4j; no answer sends the case to a person ([D-039](DECISIONS.md#d-039--the-trust-graph-runs-on-neo4j-and-no-answer-sends-the-case-to-a-person-policy-v5)) | The in-memory graph it replaced ([D-011](DECISIONS.md#d-011--graph-checks-in-memory-first)) | A network hop (about 0.15 s a check) and a free tier that pauses. Same decisions as in memory, 94 of 94 |
| Name matching | Transliterations match (Laxmi and Lakshmi) ([D-008](DECISIONS.md#d-008--name-matching-understands-transliteration)) | Exact matches only | "R Kumar" matches "Ramesh Kumar": registries catch impostors, and rejecting honest spellings is unfair |
| What drivers see | Fix reasons in full; review reasons never ([D-021](DECISIONS.md#d-021--drivers-never-see-why-they-were-sent-to-review)) | Every reason shown | Less transparency for a flagged driver: saying what was noticed teaches them to hide it |
| Where the vehicle check lives | A decision of its own that gates bookings ([D-049](DECISIONS.md#d-049--closer-to-a-real-marketplace-a-vehicle-check-a-penny-drop-and-a-second-look-for-hidden-instructions)) | A sixth KYC check | Two decisions per driver instead of one; the 47 KYC cases, holdout included, stay untouched |
| Test data | Made-up SPECIMEN documents only ([D-005](DECISIONS.md#d-005--fake-specimen-documents-only)) | Real IDs | Less realism; a phone-photo kit and public IDNet forgeries fill some of the gap |

Every decision, with its options and what it cost: [DECISIONS.md](DECISIONS.md), 49 in all. What went wrong and what changed: [FAILURES.md](FAILURES.md).

## Try it

- **Ramesh** has just signed up: take a blurry licence photo, then finish, submit, add his vehicle and book a load.
- **Vinod**'s bank account is in his spouse's name: enter his own and submit again.
- **Meena** and **Rahul** wait in the review queue: decide their cases.
- **Priya**'s licence runs out in 19 days: move the clock three weeks and her bookings lock.
- **Kavitha**'s phone is in Hindi.

## Run locally

```bash
git clone https://github.com/ishamishra0408/Agent-KYC && cd Agent-KYC
npm install
npm run specimens   # makes the SPECIMEN photos
npm run dev         # http://localhost:5273
```

No keys needed. For the real AI reader and the Neo4j graph, copy `.env.example` to `.env` and fill it in.

<details>
<summary>More commands</summary>

```bash
npm test                                    # 211 tests, no keys
npm run evals:gate                          # the policy against the answer key
npm run policy:test                         # 41 Rego tests
npm run evals -- --reader=app               # the AI reader on the test cases (needs OPENROUTER_API_KEY)
npm run evals:bakeoff                       # the five-model comparison
npm run graph:parity                        # the same decisions on Neo4j and in memory
npm run idnet:fetch && npm run evals:idnet  # the forgery test
npm run c4 && npm run c4:check              # the architecture diagrams (needs Docker and drawing-office)
```

</details>

## Learn more

[PRD](PRD.md) · [49 decisions](DECISIONS.md) · [27 failures and fixes](FAILURES.md) · [architecture](architecture/agent-kycready/workspace.dsl) · [evals](evals/README.md)

Stack: React · Express · SQLite · Open Policy Agent (Rego compiled to WebAssembly) · OpenRouter · Neo4j Aura.

Built by Isha Mishra with Claude Code: a rebuild of a driver KYC flow she owned at a logistics marketplace. Every document is a made-up SPECIMEN; registries and notifications are simulated. The architecture diagrams use [drawing-office](https://github.com/devpath56/drawing-office), fetched separately; the background paths are ported from [Kokonut UI](https://github.com/kokonut-labs/kokonutui) ([MIT notice](THIRD-PARTY-NOTICES.md)). MIT.
