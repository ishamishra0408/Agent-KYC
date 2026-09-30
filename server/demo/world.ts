import { BACKGROUND_DRIVERS, CASES } from "../../evals/cases";
import { type GraphFactory, inMemoryGraph } from "../adapters/graph";
import { SimulatedRegistry } from "../adapters/registry";
import { StepGatedRegistry } from "../adapters/stepGatedRegistry";
import type { SpecimenLike } from "../ai/simulatedReader";
import type { Store } from "../db/store";
import type { Clock } from "../domain/clock";
import { istDate } from "../domain/time";
import type { BankRecord, DocType } from "../domain/types";
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
}

export function createWorld(): DemoWorld {
  const registry = new SimulatedRegistry({
    dl: CASES.flatMap((c) => c.registry.dl),
    pan: CASES.flatMap((c) => c.registry.pan),
    bankByDriver: Object.fromEntries(CASES.map((c) => [c.driver.id, c.registry.bank])),
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

    shot(driverId, slot, variant) {
      const c = caseForDriver(driverId);
      const doc = c && shotDoc(c, slot, variant);
      return c && doc ? { id: shotId(c.id, slot, variant), doc } : undefined;
    },

    verifyDeps(store, clock, graph = inMemoryGraph) {
      const gated = new StepGatedRegistry(registry, {
        bankChecked: (id) => store.hasStep(id, "bank_check"),
        selfieTaken: (id) => store.hasStep(id, "selfie"),
      });
      // The graph sees verified bank accounts of drivers in the store, plus drivers already on the platform.
      const drivers = [...store.listDrivers(), ...BACKGROUND_DRIVERS.map((b) => b.driver)];
      const banks: Record<string, BankRecord | null> = Object.fromEntries(BACKGROUND_DRIVERS.map((b) => [b.driver.id, b.bank]));
      for (const d of store.listDrivers()) {
        if (store.hasStep(d.id, "bank_check")) banks[d.id] = caseForDriver(d.id)?.registry.bank ?? null;
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
