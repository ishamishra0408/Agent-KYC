import type { GraphPort } from "./adapters/graph";
import type { RegistryPort } from "./adapters/registry";
import type { Clock } from "./domain/clock";
import { decide, photoIssue } from "./policy";
import type {
  Decision,
  DlRecord,
  DocType,
  Driver,
  Evidence,
  PanRecord,
  ReasonCode,
  Submission,
} from "./domain/types";

export interface VerifyDeps {
  registry: RegistryPort;
  graph: GraphPort;
  clock: Clock;
  findDriver: (id: string) => Driver | undefined;
  isOwnerVerified: (ownerId: string) => boolean; // has this fleet owner passed KYC?
  priorFixReasons: (driverId: string) => ReasonCode[][];
}

// The number the reader saw, but only if the photo meets the policy's photo standard (D-012).
function trustedNumber(sub: Submission, doc: DocType): string | undefined {
  const r = sub.readings[doc];
  if (!r || photoIssue(r, doc) !== null) return undefined;
  const n = r.fields.number?.trim();
  return n ? n : undefined;
}

// Step 1: gather evidence (readings, registry checks, graph signals, history). No writes.
export async function gatherEvidence(sub: Submission, deps: VerifyDeps): Promise<Evidence> {
  const { driver, readings } = sub;
  const digilocker = sub.digilocker ?? {};

  let dlRecord: DlRecord | null | undefined;
  if (digilocker.DL) {
    dlRecord = await deps.registry.digilockerDl(driver.id);
  } else {
    const n = trustedNumber(sub, "DL");
    if (n) dlRecord = await deps.registry.lookupDl(n);
  }

  let panRecord: PanRecord | null | undefined;
  if (digilocker.PAN) {
    panRecord = await deps.registry.digilockerPan(driver.id);
  } else {
    const n = trustedNumber(sub, "PAN");
    if (n) panRecord = await deps.registry.lookupPan(n);
  }

  const bank = await deps.registry.verifyBank(driver.id);
  const face = await deps.registry.faceMatch(driver.id);
  const owner = driver.fleetOwnerId ? (deps.findDriver(driver.fleetOwnerId) ?? null) : null;
  const graph = await deps.graph.signalsFor(driver, bank);

  return {
    driver,
    readings,
    digilocker,
    dlRecord,
    panRecord,
    bank,
    face,
    owner,
    ownerVerified: owner ? deps.isOwnerVerified(owner.id) : false,
    graph,
    priorFixReasons: deps.priorFixReasons(driver.id),
    registrySimulated: deps.registry.simulated,
    now: deps.clock.now(),
  };
}

// Step 2: the policy decides, inside the domain's contract (D-030).
export async function verifySubmission(sub: Submission, deps: VerifyDeps): Promise<Decision> {
  return decide(await gatherEvidence(sub, deps));
}
