import type { BankRecord, DlRecord, FaceResult, PanRecord } from "../domain/types";
import type { RegistryPort } from "./registry";

export interface CompletedSteps {
  bankChecked(driverId: string): boolean;
  selfieTaken(driverId: string): boolean;
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

  async verifyBank(driverId: string): Promise<BankRecord | null> {
    return this.done.bankChecked(driverId) ? this.inner.verifyBank(driverId) : null;
  }

  async faceMatch(driverId: string): Promise<FaceResult> {
    return this.done.selfieTaken(driverId) ? this.inner.faceMatch(driverId) : "not_checked";
  }
}
