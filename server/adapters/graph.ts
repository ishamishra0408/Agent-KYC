import { namesMatch } from "../domain/names";
import type { BankRecord, Driver, GraphSignals } from "../domain/types";

// Relationship signals the rules use. Neo4j answers behind this interface (neo4jGraph.ts, D-039);
// the in-memory graph below answers in tests and in the offline evals.
export interface GraphPort {
  signalsFor(driver: Driver, bank: BankRecord | null): Promise<GraphSignals>;
}

// Builds a graph over the platform's drivers and the accounts they're paid into.
export type GraphFactory = (drivers: Driver[], bankByDriver: Record<string, BankRecord | null>) => GraphPort;
export const inMemoryGraph: GraphFactory = (drivers, bankByDriver) => new InMemoryGraph(drivers, bankByDriver);

// What it means when drivers share one account. Both graphs use this, so they can only differ in
// who they find on the account, never in what that means. Name matching stays in TypeScript (D-030).
export function sharedAccount(
  driver: Driver,
  bank: BankRecord,
  onAccount: readonly Pick<Driver, "id" | "name" | "fleetOwnerId">[],
): GraphSignals["sharedBankAccount"] {
  const drivers = onAccount.some((d) => d.id === driver.id) ? [...onAccount] : [...onAccount, driver];
  if (drivers.length < 2) return null;
  const holder = drivers.find((d) => namesMatch(d.name, bank.holderName).match);
  return {
    accountId: bank.accountId,
    holderName: bank.holderName,
    sharers: drivers.map((d) => ({
      driverId: d.id,
      name: d.name,
      isHolder: holder?.id === d.id,
      claimsHolderAsOwner: holder !== undefined && d.fleetOwnerId === holder.id,
    })),
  };
}

// In-memory stand-in for the Neo4j trust graph.
export class InMemoryGraph implements GraphPort {
  constructor(
    private readonly drivers: Driver[],
    private readonly bankByDriver: Record<string, BankRecord | null>,
  ) {}

  async signalsFor(driver: Driver, bank: BankRecord | null): Promise<GraphSignals> {
    if (!bank) return { status: "ok", sharedBankAccount: null };
    const onAccount = this.drivers.filter((d) => d.id === driver.id || this.bankByDriver[d.id]?.accountId === bank.accountId);
    return { status: "ok", sharedBankAccount: sharedAccount(driver, bank, onAccount) };
  }
}
