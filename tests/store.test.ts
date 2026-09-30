import { describe, expect, it } from "vitest";
import { OwnerLinkError, Store } from "../server/db/store";
import { TransitionError } from "../server/domain/statusMachine";
import { decide } from "../server/policy";
import { vehicleRules } from "../server/policy";
import { DecisionRefusedError, ForgedDecisionError, applyRulesDecision, applyVehicleDecision, humanDecision, MissingReasonError, tryBook } from "../server/services/onboarding";
import { nextStep } from "../server/services/kyc";
import { cleanEvidence, decisions, NOW } from "./helpers";

function submittedDriver(store: Store, id = "d1") {
  store.addDriver({ id, name: "Ramesh Kumar", phone: "+91 00000 00001", partnerType: "owner_driver" }, NOW);
  for (const s of ["CONSENTED", "DOCS_IN_PROGRESS", "SUBMITTED"] as const) store.move(id, s, "driver", NOW);
}

describe("Store and onboarding", () => {
  it("logs signup and every status change", () => {
    const store = new Store();
    submittedDriver(store);
    expect(store.events("d1").map((e) => e.toStatus)).toEqual(["SIGNED_UP", "CONSENTED", "DOCS_IN_PROGRESS", "SUBMITTED"]);
  });

  it("refuses an illegal move and leaves the status alone", () => {
    const store = new Store();
    submittedDriver(store);
    expect(() => store.move("d1", "ACTIVE", "system", NOW)).toThrow(TransitionError);
    expect(store.mustGet("d1").status).toBe("SUBMITTED");
  });

  it("won't let the AI approve anyone, even straight through the store", () => {
    const store = new Store();
    submittedDriver(store);
    expect(() => store.move("d1", "APPROVED", "ai", NOW)).toThrow(TransitionError);
  });

  it("refuses a decision the rules engine didn't make", () => {
    const store = new Store();
    submittedDriver(store);
    const forged = { outcome: "APPROVE" as const, reasons: [], passed: [], notices: [], rulesVersion: "v3" };
    expect(() => applyRulesDecision(store, "d1", forged, NOW)).toThrow(ForgedDecisionError);
    expect(() => applyRulesDecision(store, "d1", { ...decisions.review(), outcome: "APPROVE" }, NOW)).toThrow(ForgedDecisionError);
    expect(store.mustGet("d1").status).toBe("SUBMITTED");
  });

  it("applies a real decision and stores what passed and which rules decided", () => {
    const store = new Store();
    submittedDriver(store);
    expect(applyRulesDecision(store, "d1", decisions.approve(), NOW).status).toBe("APPROVED");
    const d = store.latestDecision("d1");
    expect(d?.actor).toBe("rules");
    expect(d?.rulesVersion).toBe("v7");
    expect(d?.passed.map((p) => p.check)).toContain("DL_VALID");
  });

  it("keeps the audit trail append-only", () => {
    const store = new Store();
    submittedDriver(store);
    applyRulesDecision(store, "d1", decisions.approve(), NOW);
    const db = store["db"];
    expect(() => db.prepare("UPDATE events SET actor = 'human'").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM decisions").run()).toThrow(/append-only/);
  });

  it("requires a reason for every human decision", () => {
    const store = new Store();
    submittedDriver(store);
    applyRulesDecision(store, "d1", decisions.review(), NOW);
    expect(() => humanDecision(store, "d1", "APPROVE", "  ", NOW)).toThrow(MissingReasonError);
    expect(humanDecision(store, "d1", "APPROVE", "Checked registry by phone", NOW).status).toBe("APPROVED");
    expect(store.latestDecision("d1")?.note).toBe("Checked registry by phone");
  });

  it("freezes what a reviewer's decision was based on (D-048)", () => {
    const store = new Store();
    submittedDriver(store);
    applyRulesDecision(store, "d1", decisions.review(), NOW);
    const rules = store.latestDecision("d1");
    humanDecision(store, "d1", "APPROVE", "Checked registry by phone", NOW, { draft: "template" });
    const human = store.latestDecision("d1");
    expect(human?.actor).toBe("human");
    const basedOn = human?.evidence.basedOn as { at: string; rulesVersion: string; outcome: string; reasons: { code: string }[] };
    expect(basedOn.at).toBe(rules?.at);
    expect(basedOn.rulesVersion).toBe(rules?.rulesVersion);
    expect(basedOn.outcome).toBe("REVIEW");
    expect(basedOn.reasons.map((r) => r.code)).toEqual(rules?.reasons.map((r) => r.code));
    expect(human?.evidence.draft).toBe("template");
    expect(typeof human?.evidence.documents).toBe("object");
    // A rules decision carries no snapshot of its own: its reasons and checks are the record.
    expect(rules?.evidence).toEqual({});
  });

  it("won't let a reviewer approve a licence the registry says has expired", () => {
    const store = new Store();
    submittedDriver(store);
    const expired = { number: "KA0120150004821", name: "RAMESH KUMAR", dob: "1988-03-14", validTill: "2026-01-01" };
    applyRulesDecision(store, "d1", decide(cleanEvidence({ dlRecord: expired, face: "no_match" })), NOW);
    expect(store.mustGet("d1").status).toBe("IN_REVIEW");
    expect(() => humanDecision(store, "d1", "APPROVE", "Looks fine", NOW)).toThrow(DecisionRefusedError);
    expect(humanDecision(store, "d1", "NEEDS_FIX", "Upload your renewed licence", NOW, { step: "DL" }).status).toBe("NEEDS_FIX");
  });

  it("restarts the repeated-fix count after an approval", () => {
    const store = new Store();
    submittedDriver(store);
    const fix = { code: "DL_EXPIRED", severity: "fix", driverMessage: "", opsMessage: "" } as const;
    store.recordDecision("d1", "rules", "NEEDS_FIX", [fix], [], "v4", NOW);
    store.recordDecision("d1", "rules", "NEEDS_FIX", [fix], [], "v4", NOW);
    expect(store.priorFixReasons("d1")).toEqual([["DL_EXPIRED"], ["DL_EXPIRED"]]);
    store.recordDecision("d1", "rules", "APPROVE", [], [], "v4", NOW);
    expect(store.priorFixReasons("d1")).toEqual([]);
    store.recordDecision("d1", "rules", "NEEDS_FIX", [fix], [], "v4", NOW);
    expect(store.priorFixReasons("d1")).toEqual([["DL_EXPIRED"]]);
  });

  it("sends the driver to whichever step the reviewer picked, and needs one (question 8)", () => {
    for (const step of ["DL", "PAN", "BANK", "SELFIE"] as const) {
      const store = new Store();
      submittedDriver(store);
      applyRulesDecision(store, "d1", decisions.review(), NOW);
      if (step === "DL") expect(() => humanDecision(store, "d1", "NEEDS_FIX", "Redo it", NOW)).toThrow(MissingReasonError);
      humanDecision(store, "d1", "NEEDS_FIX", "Redo it", NOW, { step });
      expect(nextStep(store, store.mustGet("d1"))).toBe(step);
      expect(store.priorFixReasons("d1")).toEqual([["REVIEWER_FIX"]]);
    }
  });

  it("keeps bookings locked until approval", () => {
    const store = new Store();
    submittedDriver(store);
    expect(tryBook(store, "d1")).toEqual({ ok: false, httpStatus: 403, message: "Finish verification to book loads." });
    applyRulesDecision(store, "d1", decisions.review(), NOW);
    expect(tryBook(store, "d1").ok).toBe(false);
    humanDecision(store, "d1", "APPROVE", "Looks fine", NOW);
    expect(tryBook(store, "d1")).toEqual({ ok: false, httpStatus: 403, message: "Add a verified vehicle to book loads." }); // D-049
    const facts = { number: "KA05MN4821", record: { number: "KA05MN4821", ownerName: "RAMESH KUMAR", vehicleClass: "LGV", registeredTill: "2034-06-30" }, driver: { identity: "RAMESH KUMAR", partnerType: "owner_driver" as const, ownerLinkVerified: false }, fleetOwnerIdentity: null, ownerVerified: false, today: "2026-09-29", registrySimulated: true };
    applyVehicleDecision(store, "d1", facts.number, facts.record, vehicleRules.decide(facts), NOW);
    expect(tryBook(store, "d1")).toEqual({ ok: true });
    expect(tryBook(store, "nobody")).toMatchObject({ ok: false, httpStatus: 404 });
  });

  describe("fleet owner confirmation", () => {
    const owner = { id: "o1", name: "Raju Naik", phone: "+91 00000 00009", partnerType: "fleet_owner" as const };
    const hired = { id: "h1", name: "Anand Rao", phone: "+91 00000 00002", partnerType: "hired_driver" as const, fleetOwnerId: "o1" };

    it("starts every driver unconfirmed, whatever the signup says", () => {
      const store = new Store();
      store.addDriver(owner, NOW);
      expect(store.addDriver({ ...hired, ownerLinkVerified: true }, NOW).ownerLinkVerified).toBe(false);
    });

    it("lets only the named fleet owner confirm", () => {
      const store = new Store();
      store.addDriver(owner, NOW);
      store.addDriver({ id: "o2", name: "Other Owner", phone: "+91 00000 00008", partnerType: "fleet_owner" }, NOW);
      store.addDriver(hired, NOW);
      expect(() => store.confirmOwnerLink("h1", "o2", NOW)).toThrow(OwnerLinkError);
      expect(store.confirmOwnerLink("h1", "o1", NOW).ownerLinkVerified).toBe(true);
      expect(store.events("h1").at(-1)?.payload).toEqual({ confirmedBy: "o1" });
    });
  });

  it("rejects writes for drivers that don't exist", () => {
    expect(() => new Store().setOptedOut("ghost", true, NOW)).toThrow(/Unknown driver/);
  });
});
