# Model comparison: the document reader

Run 2026-09-29T22:13:22.199Z through OpenRouter. Same photos, same policy (rules v4), same gate: no bad case approved, at most one good case missed, no case unanswered. Total spent: $3.48.

| Reader | Main: bad approved | Holdout: bad approved | Good approved (both sets) | Gate | Cost and speed | Errors |
|---|---|---|---|---|---|---|
| Claude Opus 5.5 | 0 of 21 | 0 of 10 | 16 of 16 | **PASS** | $13.74 per 1,000 photos · 3.2 s each | 0 |
| Claude Sonnet 5.5 | 0 of 21 | 0 of 10 | 16 of 16 | **PASS** | $6.74 per 1,000 photos · 2.1 s each | 0 |
| Claude Haiku 4.5 | 0 of 21 | 0 of 10 | 15 of 16 | **PASS** | $2.97 per 1,000 photos · 4.5 s each | 0 |
| Qwen 3.8 27B (open-weight) | 0 of 21 | 0 of 10 | 16 of 16 | FAIL | $1.70 per 1,000 photos · 11.1 s each | 1 |
| Gemma 4 31B (open-weight) | 0 of 21 | 0 of 10 | 16 of 16 | **PASS** | $0.10 per 1,000 photos · 8.2 s each | 0 |

Baselines on the main set's photos: no reading approves 11 of 21 bad; plain image checks approves 5 of 21 bad; perfect reading approves 0 of 21 bad.
