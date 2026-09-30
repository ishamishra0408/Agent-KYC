# 1. The nudge writer and assistant stay templates until they're measured

Date: 2026-09-29

## Status

Accepted

## Context

Nudges and chat replies are drafted by templates today. A model could write them better, but a
writer never decides anything: the send gateway decides what goes out and when.

## Decision

Drawn as Modified: the seat exists, filled by templates. A model replaces them after the document
reader, behind the same interface, and the gateway's limits (one nudge per two days, nothing at
night) stay in code.

## Consequences

The Modified tag goes when a model writes the drafts; the gateway is unchanged either way.
