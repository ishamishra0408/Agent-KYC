# 1. The trust graph moves to Neo4j

Date: 2026-09-29

## Status

Accepted

## Context

The policy asks the graph one question: is this bank account shared with drivers who have no link
to its holder? An in-memory graph answered it for the demo's few dozen drivers. A graph database
can follow links further, and reviewers can look at it.

## Decision

Built in Phase 5: Neo4j Aura holds drivers, bank accounts and fleet owners. The trust graph adapter
talks to it over the HTTPS Query API, so there's no driver package. Each check brings the graph up
to date with the platform, then asks who else is on the account, and the meaning of a shared
account stays in one piece of TypeScript both graphs use. When Neo4j can't answer, the adapter says
so and policy v5 sends the case to a person: no answer is never read as "no shared account". The
switch was proven the way the OPA one was: 94 of 94 eval decisions identical on Neo4j and in memory.
The ops console draws the account and its users from the graph. (Project log: D-039.)

## Consequences

A hosted database and a network hop, about 0.15 seconds per check. The Free instance pauses after
three days without writes; until it's resumed, cases go to a person. New signals, such as a shared
phone or one licence on two signups, would be new facts and new rules: a new policy version,
reviewed through the decision snapshot like any other change.
