# 1. The document reader is measured before it reads for a real driver

Date: 2026-09-29

## Status

Superseded by [2. The app reads with Gemma 4 31B, and Claude Sonnet when Gemma is slow or fails](0002-the-app-reads-with-gemma-and-sonnet-when-gemma-is-slow-or-fails.md)

## Context

The app ships with a simulated reader that knows exactly what is in each SPECIMEN photo. The AI
reader is the one component that sees untrusted input: a photo that may carry text aimed at it.

## Decision

The reader is drawn as Modified: the seat exists and a stand-in fills it. The AI reader runs first in
the eval harness, through the same policy and gate as every other reader, and it sees only the
photo: not the slot it was uploaded to, not the number the driver typed. Text on a document is data;
anything aimed at the verification is reported, never obeyed. It moves into the app only after the
model comparison passes the gate. (Project log: D-035.)

## Consequences

The Modified tag is retired, and this record superseded, in the change that switches the app from
the stand-in to the measured model.
