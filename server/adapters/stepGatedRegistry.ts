import type { BankRecord, DlRecord, FaceResult, PanRecord, VehicleRecord } from "../domain/types";
import type { RegistryPort } from "./registry";

export interface CompletedSteps {
  bankChecked(driverId: string): boolean;
  selfieTaken(driverId: string): boolean;
  linkedBank?(driverId: string): BankRecord | null; // the account the driver's penny drop found (D-049)
}

// Registry answers gated on what the driver has actually done: no Rs 1 check yet means no
// verified account, no selfie yet means not checked. The underlying records stay SIMULATED.
export class StepGatedRegistry implements RegistryPort {
  readonly simulated: boolean;

  constructor(
    private readonly inner: RegistryPort,
    private readonly done: CompletedSteps,
  ) {
    this.simulated = inner.simulated;
  }

  lookupDl(number: string): Promise<DlRecord | null> {
    return this.inner.lookupDl(number);
  }

  lookupPan(number: string): Promise<PanRecord | null> {
    return this.inner.lookupPan(number);
  }

  digilockerDl(driverId: string): Promise<DlRecord | null> {
    return this.inner.digilockerDl(driverId);
  }

  digilockerPan(driverId: string): Promise<PanRecord | null> {
    return this.inner.digilockerPan(driverId);
  }

  // The account the driver's own penny drop found, when there's one on record.
  async verifyBank(driverId: string): Promise<BankRecord | null> {
    if (!this.done.bankChecked(driverId)) return null;
    return this.done.linkedBank ? this.done.linkedBank(driverId) : this.inner.verifyBank(driverId);
  }

  pennyDrop(accountNumber: string, ifsc: string): Promise<BankRecord | null> {
    return this.inner.pennyDrop(accountNumber, ifsc);
  }

  lookupVehicle(number: string): Promise<VehicleRecord | null> {
    return this.inner.lookupVehicle(number);
  }

  async faceMatch(driverId: string): Promise<FaceResult> {
    return this.done.selfieTaken(driverId) ? this.inner.faceMatch(driverId) : "not_checked";
  }
}
