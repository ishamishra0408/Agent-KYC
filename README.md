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

## Engineering decisions

| Tech | Its job here | Why this | Instead of | What it costs |
|---|---|---|---|---|
| **TypeScript**, end to end | The driver app, the ops console, the API, the evals and the scripts | One language, with types shared by the server, the client and the eval harness, so the evals run the app's own code ([D-003](DECISIONS.md#d-003--typescript-vite--react--express--sqlite)) | Python and Streamlit | More work up front than a notebook UI |
| **React 19 + Vite** | The driver's phone and the ops console, side by side on one page | A product-grade UI, instant reloads while building, one static build to ship | Streamlit, or a server-rendered framework | A JavaScript bundle to ship and no server rendering |
| **Express 5 + zod** | The API server, the only place a driver's status changes; zod checks every request | Small and well known; the services stay plain functions the tests call directly | A full-stack framework, or serverless functions | Routing and error handling written by hand |
| **SQLite** (better-sqlite3), in memory | Drivers, documents, decisions, events, nudges, penny drops, vehicles | No setup, synchronous and fast, and triggers make the logs refuse edits in the database itself ([D-014](DECISIONS.md#d-014--only-the-rules-engines-own-decisions-can-be-applied)) | Postgres | State resets on restart (the demo re-seeds by running the real flow, [D-023](DECISIONS.md#d-023--the-demo-is-seeded-by-running-the-real-flow)); production needs a server database |
| **Open Policy Agent** (Rego), compiled to WebAssembly | The only automatic decider: the KYC policy (v7) and the vehicle policy (v1), run in-process | Rules as versioned data with their own 41 tests; WebAssembly means no policy server and offline tests ([D-030](DECISIONS.md#d-030--the-decision-rules-are-policy-as-code-on-open-policy-agent)) | Rules in TypeScript, or a policy server | A second language and a build step; adopted only after it reproduced 137 recorded decisions exactly |
| **A TypeScript contract** around the policy | Checks every answer, mints the decisions (only minted ones apply), blocks an approval without positive evidence | "AI can't approve" holds even when a rule is wrong ([D-014](DECISIONS.md#d-014--only-the-rules-engines-own-decisions-can-be-applied)) | Trusting the policy's output | Key invariants written twice, in Rego and TypeScript |
| **OpenRouter** | The one gateway to every model | One API and key for the five-model comparison and the fallback; models swap behind an interface ([D-033](DECISIONS.md#d-033--openrouter-only)) | Each vendor's own SDK | A middleman between the app and every model |
| **Gemma 4 31B**, **Claude Sonnet** as fallback | Reads each document photo into fields and flags; never decides | Gemma got every decision right, as Claude Opus did, at $0.10 instead of $13.74 per 1,000 photos; Sonnet steps in after 15 s or a failure ([D-038](DECISIONS.md#d-038--the-app-reads-photos-with-gemma-4-31b-and-claude-sonnet-when-gemma-is-slow-or-fails)) | Claude Opus for every photo | About 9 s a photo instead of 3 s; $0.68 per 1,000 photos with the fallback |
| **Neo4j Aura**, over its HTTPS Query API | The trust graph: who else is paid into a bank account, a fleet or a ring | Relationship questions are natural in a graph; the HTTPS API needs no driver package; no answer sends the case to a person ([D-039](DECISIONS.md#d-039--the-trust-graph-runs-on-neo4j-and-no-answer-sends-the-case-to-a-person-policy-v5)) | The in-memory graph it replaced ([D-011](DECISIONS.md#d-011--graph-checks-in-memory-first)) | A network hop (about 0.15 s a check) and a free tier that pauses; the same decisions as in memory, 94 of 94 |
| **Vitest**, an eval harness and a decision snapshot | 211 tests; a gate that runs the policy on 47 made-up cases; a snapshot of 141 decisions, so any policy change shows up as a diff | Tests before prompts: an AI reader ships only after passing the gate ([D-002](DECISIONS.md#d-002--tests-before-prompts), [D-035](DECISIONS.md#d-035--the-ai-document-reader-is-measured-before-it-reads-for-a-driver-phase-3)) | Tuning prompts inside the app | A slower start, paid back when the gate caught a client timeout bug ([F-024](FAILURES.md)) |
| **sharp** | Draws the SPECIMEN document photos, the link preview card and the icons | Reproducible images from code (`npm run specimens`, `og`, `icons`) | Hand-made images | A native dependency |
| **Plain CSS**: design tokens and scroll-driven animation | Both themes, the liquid glass, and the "How it works" story | Tokens keep both themes contrast-tested; the browser scrubs the story itself, with no animation library ([D-043](DECISIONS.md#d-043--outside-components-from-21stdev-reused-or-rewritten-according-to-their-licences)) | An animation library (GSAP) | Browsers without scroll-driven animation get a static grid |
| **Render**, from `render.yaml` | Hosts the live demo: one web service, the API serving the built app, redeployed on every push | The public demo runs on the stand-ins (simulated reader, in-memory graph), so it spends no credit and writes nothing private | Separate hosts for the app and the API | The free tier sleeps, so a first visit can take a minute |
| **A C4 model** in Structurizr DSL, drawn with drawing-office | The architecture as checked text: containers, components and six traced flows | Structure and reasons in one versioned place, with checks that catch an unlabelled change ([D-036](DECISIONS.md#d-036--the-architecture-is-a-c4-model-drawn-with-drawing-office)) | Diagrams drawn by hand | Rendering needs Docker and a separate tool |

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
