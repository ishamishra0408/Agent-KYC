import type { Actor, Status } from "./types";

// Every allowed move, and who may make it.
// No edge into APPROVED lists "ai": the AI has no way to approve anyone.
export const EDGES: ReadonlyArray<readonly [Status, Status, readonly Actor[]]> = [
  ["SIGNED_UP", "CONSENTED", ["driver"]],
  ["CONSENTED", "DOCS_IN_PROGRESS", ["driver"]],
  ["DOCS_IN_PROGRESS", "SUBMITTED", ["driver", "system"]],
  ["SUBMITTED", "APPROVED", ["rules"]],
  ["SUBMITTED", "NEEDS_FIX", ["rules"]],
  ["SUBMITTED", "IN_REVIEW", ["rules"]],
  ["NEEDS_FIX", "DOCS_IN_PROGRESS", ["driver"]],
  ["NEEDS_FIX", "SUBMITTED", ["driver", "system"]],
  ["IN_REVIEW", "APPROVED", ["human"]],
  ["IN_REVIEW", "NEEDS_FIX", ["human"]],
  ["IN_REVIEW", "REJECTED", ["human"]],
  ["APPROVED", "ACTIVE", ["system"]],
  // Question 9 (D-032): a lapsed licence locks bookings; the renewed licence goes back through the rules.
  ["APPROVED", "LICENCE_EXPIRED", ["system"]],
  ["ACTIVE", "LICENCE_EXPIRED", ["system"]],
  ["LICENCE_EXPIRED", "SUBMITTED", ["driver"]],
];

export class TransitionError extends Error {}

export function canTransition(from: Status, to: Status, actor: Actor): boolean {
  return EDGES.some(([f, t, actors]) => f === from && t === to && actors.includes(actor));
}

export function assertTransition(from: Status, to: Status, actor: Actor): void {
  if (!canTransition(from, to, actor)) {
    throw new TransitionError(`${actor} can't move a driver from ${from} to ${to}`);
  }
}

// Drivers waiting on *us* get status updates, never reminders.
export const WAITING_ON_US: ReadonlySet<Status> = new Set<Status>(["SUBMITTED", "IN_REVIEW"]);
export const DONE: ReadonlySet<Status> = new Set<Status>(["APPROVED", "ACTIVE", "REJECTED"]);
