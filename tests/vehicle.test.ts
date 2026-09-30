import { describe, expect, it } from "vitest";
import { Store } from "../server/db/store";
import { makeVehicleRules, type VehicleEngine, type VehicleFacts, VehicleContractError } from "../server/domain/vehicle";
import { vehicleRules } from "../server/policy";
import { createWorld } from "../server/demo/world";
import { ManualClock } from "../server/domain/clock";
import { istAt } from "../server/domain/time";
import { addVehicle, bankCheck, consent, submit, signUp, takePhoto, takeSelfie, type KycContext } from "../server/services/kyc";
import { applyVehicleDecision, ForgedDecisionError, tryBook } from "../server/services/onboarding";

// The vehicle decision (D-049): the policy decides, the contract checks it, and only its decisions apply.
const own: VehicleFacts = {
  number: "KA05MN4821",
  record: { number: "KA05MN4821", ownerName: "RAMESH KUMAR", vehicleClass: "LGV", registeredTill: "2034-06-30" },
  driver: { identity: "RAMESH KUMAR", partnerType: "owner_driver", ownerLinkVerified: false },
  fleetOwnerIdentity: null,
  ownerVerified: false,
  today: "2026-09-29",
  registrySimulated: true,
};
const hired: VehicleFacts = {
  ...own,
  number: "KA04RN9902",
  record: { number: "KA04RN9902", ownerName: "RAJU NAIK", vehicleClass: "LGV", registeredTill: "2033-11-02" },
  driver: { identity: "ANAND RAO", partnerType: "hired_driver", ownerLinkVerified: true },
  fleetOwnerIdentity: "RAJU NAIK",
  ownerVerified: true,
};

describe("vehicle decision", () => {
  it("approves the driver's own goods vehicle, matching names the way KYC does", () => {
    const d = vehicleRules.decide(own);
    expect(d.outcome).toBe("APPROVE");
    expect(d.passed.map((p) => p.check)).toEqual(["VEHICLE_FOUND", "VEHICLE_OWNER", "VEHICLE_GOODS", "VEHICLE_VALID"]);
    expect(vehicleRules.decide({ ...own, driver: { ...own.driver, identity: "R Kumar" } }).outcome).toBe("APPROVE"); // D-008: initials
  });

  it("lets a hired driver add the fleet owner's vehicle only once the owner is verified and has confirmed them", () => {
    expect(vehicleRules.decide(hired).outcome).toBe("APPROVE");
    expect(vehicleRules.decide({ ...hired, driver: { ...hired.driver, ownerLinkVerified: false } }).reasons.map((r) => r.code)).toEqual(["VEHICLE_OWNER_LINK_UNVERIFIED"]);
    expect(vehicleRules.decide({ ...hired, ownerVerified: false }).reasons.map((r) => r.code)).toEqual(["VEHICLE_OWNER_NOT_VERIFIED"]);
  });

  it("asks for a fix, never approves, when the vehicle isn't theirs, isn't found, isn't for goods or has lapsed", () => {
    const code = (f: VehicleFacts) => vehicleRules.decide(f).reasons.map((r) => r.code);
    expect(code({ ...own, record: { ...own.record!, ownerName: "SANJAY RAO" } })).toEqual(["VEHICLE_OWNER_MISMATCH"]);
    expect(code({ ...own, record: null })).toEqual(["VEHICLE_NOT_FOUND"]);
    expect(code({ ...own, record: { ...own.record!, vehicleClass: "LMV" } })).toEqual(["VEHICLE_NOT_GOODS"]);
    expect(code({ ...own, record: { ...own.record!, registeredTill: "2026-09-28" } })).toEqual(["VEHICLE_REGISTRATION_EXPIRED"]);
  });

  it("won't let an approval of someone else's vehicle, or of a car, through, whatever the policy says", () => {
    const lying: VehicleEngine = {
      evaluate: (entrypoint) =>
        entrypoint === "vehicle/version"
          ? "v1"
          : {
              version: "v1",
              outcome: "APPROVE",
              reasons: [],
              passed: ["VEHICLE_FOUND", "VEHICLE_OWNER", "VEHICLE_GOODS", "VEHICLE_VALID"].map((check, i) => ({ check, rank: i, evidence: {}, simulated: true })),
            },
    };
    const d = makeVehicleRules(lying).decide({ ...own, record: { ...own.record!, ownerName: "SANJAY RAO" } });
    expect(d.outcome).toBe("NEEDS_FIX");
    expect(d.reasons[0]).toMatchObject({ code: "VEHICLE_NOT_VERIFIED", evidence: { caughtBy: "contract" } });
    const car = makeVehicleRules(lying).decide({ ...own, record: { ...own.record!, vehicleClass: "LMV" } });
    expect(car.reasons[0]).toMatchObject({ code: "VEHICLE_NOT_VERIFIED", evidence: { invariant: "approval of a vehicle that doesn't carry goods" } });
  });

  it("rejects a malformed answer from the policy", () => {
    const broken: VehicleEngine = { evaluate: (e) => (e === "vehicle/version" ? "v1" : { version: "v1", outcome: "MAYBE", reasons: [], passed: [] }) };
    expect(() => makeVehicleRules(broken)).toThrow(VehicleContractError);
  });

  it("applies only decisions the vehicle policy minted, and keeps every one", () => {
    const store = new Store();
    store.addDriver({ id: "d1", name: "Ramesh Kumar", phone: "+91 00000 00001", partnerType: "owner_driver" }, new Date("2026-09-29T04:30:00Z"));
    const forged = { outcome: "APPROVE" as const, reasons: [], passed: [], rulesVersion: "v1" };
    expect(() => applyVehicleDecision(store, "d1", own.number, own.record, forged, new Date())).toThrow(ForgedDecisionError);
    applyVehicleDecision(store, "d1", own.number, own.record, vehicleRules.decide(own), new Date());
    expect(store.latestVehicle("d1")?.outcome).toBe("APPROVE");
    expect(() => store["db"].prepare("DELETE FROM vehicles").run()).toThrow(/append-only/);
  });

  it("matches the owner against the name of record, not the name typed at sign-up", async () => {
    // Someone signs up as Sanjay Rao with Ramesh's documents: KYC checks the documents, and the vehicle
    // is matched against the licence registry's name, so Sanjay's vehicle doesn't pass as theirs.
    const ctx: KycContext = { store: new Store(), clock: new ManualClock(istAt(2026, 8, 29, 10)), world: createWorld() };
    signUp(ctx, { id: "c01", name: "Sanjay Rao", phone: "+91 00000 00001", partnerType: "owner_driver" });
    consent(ctx, "c01");
    await takePhoto(ctx, "c01", "DL", "clean");
    await takePhoto(ctx, "c01", "PAN", "clean");
    const hint = ctx.world.bankHint("c01");
    if (hint) await bankCheck(ctx, "c01", hint.accountNumber, hint.ifsc);
    takeSelfie(ctx, "c01");
    expect((await submit(ctx, "c01")).outcome).toBe("APPROVE");
    expect((await addVehicle(ctx, "c01", "KA03CM7777")).outcome).toBe("NEEDS_FIX"); // SANJAY RAO's
    expect((await addVehicle(ctx, "c01", "KA05MN4821")).outcome).toBe("APPROVE"); // RAMESH KUMAR's
  });

  it("locks bookings when the registration runs out after it was verified", () => {
    const store = new Store();
    store.addDriver({ id: "d1", name: "Ramesh Kumar", phone: "+91 00000 00001", partnerType: "owner_driver" }, new Date("2026-09-29T04:30:00Z"));
    store["db"].prepare("UPDATE drivers SET status = 'APPROVED' WHERE id = 'd1'").run();
    applyVehicleDecision(store, "d1", own.number, own.record, vehicleRules.decide(own), new Date());
    expect(tryBook(store, "d1", "2034-06-30")).toEqual({ ok: true }); // the last valid day
    expect(tryBook(store, "d1", "2034-07-01")).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it("keeps every penny drop, append-only", () => {
    const store = new Store();
    store.addDriver({ id: "d1", name: "Ramesh Kumar", phone: "+91 00000 00001", partnerType: "owner_driver" }, new Date("2026-09-29T04:30:00Z"));
    store.recordBankAttempt("d1", new Date(), { last4: "9012", ifsc: "SPEC0000999", record: null });
    expect(store.bankAttempts("d1")).toHaveLength(1);
    expect(() => store["db"].prepare("DELETE FROM bank_attempts").run()).toThrow(/append-only/);
    expect(() => store["db"].prepare("UPDATE bank_attempts SET ifsc = 'X'").run()).toThrow(/append-only/);
  });
});
