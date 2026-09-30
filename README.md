# Agent KYCReady

## [Open the live demo →](https://agent-kycready.onrender.com)

**Drivers sign up on a logistics marketplace, get stuck at KYC, and never book a load. Agent KYCReady gets them verified: it tells each driver the one thing blocking them, reads their documents with AI, and lets a policy decide, never the model. People only see the hard cases.**

**Live:** [demo](https://agent-kycready.onrender.com) · [ops console](https://agent-kycready.onrender.com/#/ops) — no login, nothing to install. It runs on stand-ins for the AI reader and the graph, and the first visit can take a minute to wake up.

![A driver's phone beside the ops console: the phone shows a licence renewal reminder; the console shows a case sent to a person because a bank account is shared with strangers](docs/demo.jpg)

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
4. **Unlock** — approved drivers can book; a lapsed licence locks them again.

## Does it work?

| On 47 made-up test cases | Bad cases approved | Good cases approved |
|---|---|---|
| No document reading (the old way) | 12 of 31 | 16 of 16 |
| **Agent KYCReady** | **0 of 31** | **16 of 16** |

Five AI models were compared on the same cases. The open-weight Gemma got every decision right, as Claude Opus did, at $0.10 per 1,000 photos against $13.74. The weak spot is forged documents: on public IDNet forgeries, the reader rarely spotted the edits. [How the tests work](evals/README.md) · [the model comparison](evals/results/BAKEOFF.md)

## Try it

- **Ramesh** has just signed up: take a blurry licence photo, then finish, submit and book a load.
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
npm test                                    # 189 tests, no keys
npm run evals:gate                          # the policy against the answer key
npm run policy:test                         # 29 Rego tests
npm run evals -- --reader=app               # the AI reader on the test cases (needs OPENROUTER_API_KEY)
npm run evals:bakeoff                       # the five-model comparison
npm run graph:parity                        # the same decisions on Neo4j and in memory
npm run idnet:fetch && npm run evals:idnet  # the forgery test
npm run c4 && npm run c4:check              # the architecture diagrams (needs Docker and drawing-office)
```

</details>

## Learn more

[PRD](PRD.md) · [41 decisions](DECISIONS.md) · [26 failures and fixes](FAILURES.md) · [architecture](architecture/agent-kycready/workspace.dsl) · [evals](evals/README.md)

Stack: React · Express · SQLite · Open Policy Agent (Rego compiled to WebAssembly) · OpenRouter · Neo4j Aura.

Built by Isha Mishra with Claude Code: a rebuild of a driver KYC flow she owned at a logistics marketplace. Every document is a made-up SPECIMEN; registries and notifications are simulated. The architecture diagrams use [drawing-office](https://github.com/devpath56/drawing-office), fetched separately. MIT.
