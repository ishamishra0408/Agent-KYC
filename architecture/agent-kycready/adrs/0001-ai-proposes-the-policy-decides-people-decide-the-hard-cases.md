# 1. AI proposes, the policy decides, people decide the hard cases

Date: 2026-09-28

## Status

Accepted

## Context

KYC mistakes are expensive: a bad approval is fraud, and a wrong refusal strands an honest driver.
Every decision has to be explainable, and nothing an AI writes or reads may approve anyone.

## Decision

The AI slots read documents and draft messages. Only the decision policy, or a person, can change a
driver's status to approved, and the status machine allows exactly two ways in: the policy on a
submission, a person on a review. A decision contract is the only place a decision is minted, and
the onboarding service refuses anything it didn't mint. (Project log: D-001, D-014.)

## Consequences

The document reader and the nudge writer can be swapped for any model without touching an approval.
The policy needs upkeep, and cases it can't settle go to a person rather than to a model's judgement.
