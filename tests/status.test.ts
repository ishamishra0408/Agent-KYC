import { describe, expect, it } from "vitest";
import { canBook } from "../server/domain/bookings";
import { assertTransition, canTransition, EDGES, TransitionError } from "../server/domain/statusMachine";
import type { Status } from "../server/domain/types";

const ALL: Status[] = [
  "SIGNED_UP",
  "CONSENTED",
  "DOCS_IN_PROGRESS",
  "SUBMITTED",
  "NEEDS_FIX",
  "IN_REVIEW",
  "APPROVED",
  "ACTIVE",
  "LICENCE_EXPIRED",
  "REJECTED",
];

describe("status machine", () => {
  it("has exactly two ways into APPROVED: rules on a submission, a person on a review", () => {
    const intoApproved = EDGES.filter(([, to]) => to === "APPROVED").map(([from, , actors]) => [from, [...actors]]);
    expect(intoApproved).toEqual([
      ["SUBMITTED", ["rules"]],
      ["IN_REVIEW", ["human"]],
    ]);
  });

  it("never lets the AI approve, from any state", () => {
    for (const from of ALL) expect(canTransition(from, "APPROVED", "ai")).toBe(false);
  });

  it("doesn't let rules overrule a case sent to a person", () => {
    expect(canTransition("IN_REVIEW", "APPROVED", "rules")).toBe(false);
  });

  it("locks bookings when a licence lapses, and the only way back is through the rules (question 9)", () => {
    expect(canBook("LICENCE_EXPIRED")).toBe(false);
    expect(canTransition("ACTIVE", "LICENCE_EXPIRED", "system")).toBe(true);
    expect(canTransition("ACTIVE", "LICENCE_EXPIRED", "ai")).toBe(false);
    expect(canTransition("LICENCE_EXPIRED", "SUBMITTED", "driver")).toBe(true);
    for (const actor of ["driver", "system", "rules", "human", "ai"] as const) {
      expect(canTransition("LICENCE_EXPIRED", "APPROVED", actor)).toBe(false);
      expect(canTransition("LICENCE_EXPIRED", "ACTIVE", actor)).toBe(false);
    }
  });

  it("only lets a person reject", () => {
    for (const [, to, actors] of EDGES) {
      if (to === "REJECTED") expect(actors).toEqual(["human"]);
    }
  });

  it("throws on an illegal move", () => {
    expect(() => assertTransition("SIGNED_UP", "APPROVED", "system")).toThrow(TransitionError);
  });
});

describe("bookings lock", () => {
  it.each(ALL)("status %s", (s) => {
    expect(canBook(s)).toBe(s === "APPROVED" || s === "ACTIVE");
  });
});
