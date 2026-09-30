import { BACKGROUND_DRIVERS, CASES } from "../../evals/cases";
import { type GraphFactory, inMemoryGraph } from "../adapters/graph";
import { demoAccountNumber, SimulatedRegistry } from "../adapters/registry";
import { StepGatedRegistry } from "../adapters/stepGatedRegistry";
import type { SpecimenLike } from "../ai/simulatedReader";
import type { Store } from "../db/store";
import type { Clock } from "../domain/clock";
import { namesMatch } from "../domain/names";
import { istDate } from "../domain/time";
import type { BankRecord, DocType, VehicleRecord } from "../domain/types";
import type { VerifyDeps } from "../verify";
import { caseForDriver, shotDoc, shotId, type ShotVariant } from "./shots";

export interface Shot {
  id: string;
  doc: SpecimenLike;
}

// Everything simulated about the demo: registries, DigiLocker, the camera, the platform's
// existing drivers. The rules, status machine and store are the real ones.
export interface DemoWorld {
  shot(driverId: string, slot: DocType, variant: ShotVariant): Shot | undefined;
  verifyDeps(store: Store, clock: Clock, graph?: GraphFactory): VerifyDeps; // in-memory graph unless given one
  // SIMULATED: a driver whose licence lapsed renewed it at the RTO, so DigiLocker returns the renewed one.
  renewLapsedLicence(driverId: string, now: Date): void;
  // SIMULATED: the persona's own SPECIMEN account, to fill the penny-drop form in the demo (D-049).
  bankHint(driverId: string): { accountNumber: string; ifsc: string } | null;
  // SIMULATED: the persona's vehicle, to fill the vehicle form in the demo (D-049).
  vehicleHint(driverId: string): string | null;
}

// SIMULATED: an account the bank knows beyond the personas' own: Vinod's own, so his fix (an account in
// his own name, not his spouse's) can succeed in the demo.
const EXTRA_ACCOUNTS: BankRecord[] = [{ accountId: "acct-c21-own", holderName: "VINOD PATIL", accountLast4: "2121", ifsc: "SPEC0000121" }];

// SIMULATED: the vehicle registry (Vahan-style). Each persona drives a goods vehicle in their own name,
// except hired drivers, who drive their fleet owner Raju's; and three to try that won't pass: someone
// else's, a car, and a lapsed registration.
const VEHICLES: VehicleRecord[] = [
  { number: "KA05MN4821", ownerName: "RAMESH KUMAR", vehicleClass: "LGV", registeredTill: "2034-06-30" },
  { number: "KA01AB1234", ownerName: "PRIYA SHARMA", vehicleClass: "LGV", registeredTill: "2033-01-15" },
  { number: "KA04RN9901", ownerName: "RAJU NAIK", vehicleClass: "HGV", registeredTill: "2035-08-20" },
  { number: "KA04RN9902", ownerName: "RAJU NAIK", vehicleClass: "LGV", registeredTill: "2033-11-02" },
  { number: "KA09KM1010", ownerName: "KAVITHA M", vehicleClass: "LGV", registeredTill: "2032-03-18" },
  { number: "KA10SB1111", ownerName: "SURESH BABU", vehicleClass: "MGV", registeredTill: "2031-07-09" },
  { number: "KA14MK1414", ownerName: "MEENA KUMARI", vehicleClass: "LGV", registeredTill: "2033-09-27" },
  { number: "KA21VP2121", ownerName: "VINOD PATIL", vehicleClass: "LGV", registeredTill: "2034-02-14" },
  { number: "KA27RJ2727", ownerName: "RAHUL JAIN", vehicleClass: "HGV", registeredTill: "2032-12-01" },
  { number: "KA03CM7777", ownerName: "SANJAY RAO", vehicleClass: "LGV", registeredTill: "2032-05-10" },
  { number: "KA51TX0001", ownerName: "RAMESH KUMAR", vehicleClass: "LMV", registeredTill: "2036-02-01" },
  { number: "KA02GH3456", ownerName: "RAMESH KUMAR", vehicleClass: "LGV", registeredTill: "2024-12-31" },
];
const VEHICLE_BY_DRIVER: Record<string, string> = {
  c01: "KA05MN4821",
  c06: "KA01AB1234",
  c07: "KA04RN9901",
  c08: "KA04RN9902",
  c22: "KA04RN9902",
  c10: "KA09KM1010",
  c11: "KA10SB1111",
  c14: "KA14MK1414",
  c21: "KA21VP2121",
  c27: "KA27RJ2727",
};

export function createWorld(): DemoWorld {
  const directory = [
    ...new Map(CASES.flatMap((c) => (c.registry.bank ? [[c.registry.bank.accountId, c.registry.bank] as const] : []))).values(),
    ...EXTRA_ACCOUNTS,
  ];
  const registry = new SimulatedRegistry({
    dl: CASES.flatMap((c) => c.registry.dl),
    pan: CASES.flatMap((c) => c.registry.pan),
    bankByDriver: Object.fromEntries(CASES.map((c) => [c.driver.id, c.registry.bank])),
    // Every persona's account, once each (a fleet owner's account is also their hired drivers').
    bankDirectory: directory,
    vehicles: VEHICLES,
    faceByDriver: Object.fromEntries(CASES.map((c) => [c.driver.id, c.registry.face])),
    // In the demo, DigiLocker holds every persona's licence and PAN (SIMULATED).
    digilocker: Object.fromEntries(
      CASES.map((c) => [c.driver.id, { DL: c.registry.dl[0] ?? c.digilocker?.DL, PAN: c.registry.pan[0] ?? c.digilocker?.PAN }]),
    ),
  });

  return {
    renewLapsedLicence(driverId, now) {
      registry.renewLapsedDl(driverId, istDate(now));
    },

    vehicleHint(driverId) {
      return VEHICLE_BY_DRIVER[driverId] ?? null;
    },

    // An account in the driver's own name if the bank knows one, else the one in their case.
    bankHint(driverId) {
      const c = caseForDriver(driverId);
      const bank = (c && directory.find((b) => namesMatch(b.holderName, c.driver.name).match)) ?? c?.registry.bank;
      return bank ? { accountNumber: demoAccountNumber(bank), ifsc: bank.ifsc } : null;
    },

    shot(driverId, slot, variant) {
      const c = caseForDriver(driverId);
      const doc = c && shotDoc(c, slot, variant);
      return c && doc ? { id: shotId(c.id, slot, variant), doc } : undefined;
    },

    verifyDeps(store, clock, graph = inMemoryGraph) {
      const gated = new StepGatedRegistry(registry, {
        bankChecked: (id) => store.hasStep(id, "bank_check"),
        selfieTaken: (id) => store.hasStep(id, "selfie"),
        linkedBank: (id) => store.linkedBank(id),
      });
      // The graph sees verified bank accounts of drivers in the store, plus drivers already on the platform.
      const drivers = [...store.listDrivers(), ...BACKGROUND_DRIVERS.map((b) => b.driver)];
      const banks: Record<string, BankRecord | null> = Object.fromEntries(BACKGROUND_DRIVERS.map((b) => [b.driver.id, b.bank]));
      for (const d of store.listDrivers()) {
        if (store.hasStep(d.id, "bank_check")) banks[d.id] = store.linkedBank(d.id);
      }
      return {
        registry: gated,
        graph: graph(drivers, banks),
        clock,
        findDriver: (id) => store.getDriver(id),
        isOwnerVerified: (id) => store.isVerified(id),
        priorFixReasons: (id) => store.priorFixReasons(id),
      };
    },
  };
}
