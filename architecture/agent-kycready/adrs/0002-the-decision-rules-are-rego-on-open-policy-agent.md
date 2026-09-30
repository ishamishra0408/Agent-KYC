# 2. The decision rules are Rego on Open Policy Agent, inside a contract

Date: 2026-09-29

## Status

Accepted

## Context

The rules were TypeScript. Compliance rules should be readable, testable and changeable by someone
other than the app developer, and every decision should carry the version that made it.

## Decision

The rules live in policy/kyc.rego, compiled to WebAssembly and run inside the API server. The
TypeScript rules were retired only after the port reproduced all 137 recorded decisions byte for
byte; a snapshot of those decisions now reviews every policy change. The contract around the policy
refuses unknown or inconsistent answers and sends any approval without the five core checks to a
person. (Project log: D-030, D-031, D-032.)

## Consequences

A second language and a build step. The compiled policy is kept in the repo, so running the app
needs no OPA install; changing the policy does.
