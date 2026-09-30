# 4. A lapsed licence locks bookings until a renewed one passes

Date: 2026-09-29

## Status

Accepted

## Context

A licence can run out after a driver is approved. Before this decision nothing changed: the driver
could keep booking loads.

## Decision

A licence is valid through its last day. From the next day the driver moves to Licence expired,
where the bookings lock is already closed. The driver's app asks only for the renewed licence, and
the resubmission goes back through the policy. (Project log: D-032.)

## Consequences

One more status, and a daily sweep. A driver a person approved without a registry date isn't
tracked for expiry: a known gap.
