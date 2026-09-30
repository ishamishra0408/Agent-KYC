# 2. The app reads with Gemma 4 31B, and Claude Sonnet when Gemma is slow or fails

Date: 2026-09-29

## Status

Accepted

## Context

The model comparison ran five readers on both eval sets through the same policy and gate, for $3.48.
Claude Opus 5.5, Claude Sonnet 5.5 and Gemma 4 31B got every case right, outcome and reason. Gemma,
an open-weight model, cost $0.10 per 1,000 photos against Opus's $13.74. Through OpenRouter it
answers in 8 to 13 seconds; Sonnet answers in about 2.

## Decision

The app's photo step reads with Gemma 4 31B, asking OpenRouter for its fastest provider, and with
Claude Sonnet when Gemma is slower than 15 seconds or fails, with 30 seconds of its own. No credit,
a refused key or a spent budget stops the read instead of trying Sonnet. A photo nobody could read stores nothing and asks
the driver to try again. The evals measure this same chain (`--reader=app`). The demo's seeded cast
is still read by the stand-in, so starting the demo calls no model. Real drivers wait for a round of
real phone photos of printed SPECIMEN cards. (Project log: D-038.)

## Consequences

About 9 seconds per photo, counted from the start, and the price of the cheaper model. It rarely
notices an edited document (D-040). The prompt's allowance for SPECIMEN notices has to come out
before a real document is read.
