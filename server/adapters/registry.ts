import type { BankRecord, DlRecord, FaceResult, PanRecord, VehicleRecord } from "../domain/types";

// Every registry in this project is SIMULATED. Real services (DigiLocker, Parivahan for
// licences, PAN verification, the Rs 1 reverse penny-drop, face match with liveness)
// plug in behind this same interface without touching the rules.
export interface RegistryPort {
  readonly simulated: boolean;
  lookupDl(number: string): Promise<DlRecord | null>;
  lookupPan(number: string): Promise<PanRecord | null>;
  digilockerDl(driverId: string): Promise<DlRecord | null>;
  digilockerPan(driverId: string): Promise<PanRecord | null>;
  verifyBank(driverId: string): Promise<BankRecord | null>;
  // A penny drop (D-049): Rs 1 sent to the account a driver typed in; the bank answers with the account's
  // record, or null when there's no such account.
  pennyDrop(accountNumber: string, ifsc: string): Promise<BankRecord | null>;
  // A Vahan-style vehicle lookup (D-049): the registration for a number, or null.
  lookupVehicle(number: string): Promise<VehicleRecord | null>;
  faceMatch(driverId: string): Promise<FaceResult>;
}

// The demo's SPECIMEN account numbers: 12 digits ending in the account's last four (SIMULATED).
export function demoAccountNumber(b: BankRecord): string {
  return `50100000${b.accountLast4.padStart(4, "0")}`;
}

export function normalizeDocNumber(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface SimulatedRegistryData {
  dl: DlRecord[];
  pan: PanRecord[];
  bankByDriver: Record<string, BankRecord | null>;
  bankDirectory?: BankRecord[]; // every account the simulated bank knows, for the penny drop
  vehicles?: VehicleRecord[]; // every registration the simulated vehicle registry knows
  faceByDriver: Record<string, FaceResult>;
  digilocker: Record<string, { DL?: DlRecord; PAN?: PanRecord }>;
}

export class SimulatedRegistry implements RegistryPort {
  readonly simulated = true;
  private readonly dl = new Map<string, DlRecord>();
  private readonly pan = new Map<string, PanRecord>();

  constructor(private readonly data: SimulatedRegistryData) {
    for (const r of data.dl) this.dl.set(normalizeDocNumber(r.number), r);
    for (const r of data.pan) this.pan.set(normalizeDocNumber(r.number), r);
  }

  async lookupDl(number: string): Promise<DlRecord | null> {
    return this.dl.get(normalizeDocNumber(number)) ?? null;
  }

  async lookupPan(number: string): Promise<PanRecord | null> {
    return this.pan.get(normalizeDocNumber(number)) ?? null;
  }

  async digilockerDl(driverId: string): Promise<DlRecord | null> {
    return this.data.digilocker[driverId]?.DL ?? null;
  }

  async digilockerPan(driverId: string): Promise<PanRecord | null> {
    return this.data.digilocker[driverId]?.PAN ?? null;
  }

  async verifyBank(driverId: string): Promise<BankRecord | null> {
    return this.data.bankByDriver[driverId] ?? null;
  }

  async lookupVehicle(number: string): Promise<VehicleRecord | null> {
    return (this.data.vehicles ?? []).find((v) => normalizeDocNumber(v.number) === normalizeDocNumber(number)) ?? null;
  }

  async pennyDrop(accountNumber: string, ifsc: string): Promise<BankRecord | null> {
    const number = accountNumber.replace(/\D/g, "");
    const code = ifsc.trim().toUpperCase();
    return (this.data.bankDirectory ?? []).find((b) => demoAccountNumber(b) === number && b.ifsc.toUpperCase() === code) ?? null;
  }

  // Demo only (SIMULATED): the driver renewed at the RTO, so DigiLocker and the licence registry now
  // hold the renewed licence, valid 20 more years. Returns its last valid day, or null if nothing had lapsed.
  renewLapsedDl(driverId: string, today: string): string | null {
    const held = this.data.digilocker[driverId];
    const dl = held?.DL;
    if (!held || !dl || dl.validTill >= today) return null;
    const renewed: DlRecord = { ...dl, validTill: `${Number(today.slice(0, 4)) + 20}${today.slice(4)}` };
    this.data.digilocker[driverId] = { ...held, DL: renewed };
    this.dl.set(normalizeDocNumber(renewed.number), renewed);
    return renewed.validTill;
  }

  // No selfie on record means not checked, never a silent pass.
  async faceMatch(driverId: string): Promise<FaceResult> {
    return this.data.faceByDriver[driverId] ?? "not_checked";
  }
}
