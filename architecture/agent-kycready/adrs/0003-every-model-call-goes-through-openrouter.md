# 3. Every model call goes through OpenRouter

Date: 2026-09-29

## Status

Accepted

## Context

The reader comparison needs Claude and open-weight models side by side. A second provider, Crusoe,
asked for a credit card.

## Decision

OpenRouter is the one API for every model: Claude Opus 5.5 as the baseline reader, and open-weight
vision models (Qwen, Gemma) as challengers. Requests ask for providers that don't store prompts, and
every run stops at a spending budget. (Project log: D-033, D-035.)

## Consequences

One vendor sits between us and every model. Only server/adapters/openrouter.ts knows OpenRouter's
API, so a second provider would be one more adapter behind the same reader interface.
