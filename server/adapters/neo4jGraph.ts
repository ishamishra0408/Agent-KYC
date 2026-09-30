import type { BankRecord, Driver, GraphSignals } from "../domain/types";
import { type GraphPort, sharedAccount } from "./graph";
import type { Neo4j } from "./neo4j";

// The trust graph on Neo4j (D-039).
//   (:Driver {world, id, name, fleetOwnerId, order})-[:PAID_INTO]->(:BankAccount {world, accountId, holderName})
//   (:Driver)-[:DRIVES_FOR]->(:Driver)   a hired driver and the fleet owner they name
// `world` keeps the demo and each eval set apart in one database. Each check first brings its world
// up to date with the platform (who is paid into which account), then asks who else is on the account.
// If Neo4j can't answer, the graph says so, and the policy sends the case to a person (policy v5).

// Written as one statement so a check never sees half an update. FOREACH over a one-item list is
// Cypher's way of writing only when a value is there.
const SYNC = `
UNWIND $drivers AS d
MERGE (x:Driver {world: $world, id: d.id})
SET x.name = d.name, x.fleetOwnerId = d.fleetOwnerId, x.order = d.order
WITH x, d
OPTIONAL MATCH (x)-[old:PAID_INTO]->(:BankAccount)
DELETE old
WITH DISTINCT x, d
FOREACH (_ IN CASE WHEN d.accountId IS NULL THEN [] ELSE [1] END |
  MERGE (a:BankAccount {world: $world, accountId: d.accountId})
  SET a.holderName = d.holderName
  MERGE (x)-[:PAID_INTO]->(a))
FOREACH (_ IN CASE WHEN d.fleetOwnerId IS NULL THEN [] ELSE [1] END |
  MERGE (o:Driver {world: $world, id: d.fleetOwnerId})
  MERGE (x)-[:DRIVES_FOR]->(o))`;

// Only drivers on the platform now: one who has left keeps their old PAID_INTO from an earlier sync.
const ON_ACCOUNT = `
MATCH (d:Driver {world: $world})-[:PAID_INTO]->(:BankAccount {world: $world, accountId: $accountId})
WHERE d.id IN $ids
RETURN d.id AS id, d.name AS name, d.fleetOwnerId AS fleetOwnerId, d.order AS order
ORDER BY d.order`;

type OnAccount = { id: string; name: string; fleetOwnerId?: string; order: number };

export class Neo4jGraph implements GraphPort {
  constructor(
    private readonly db: Neo4j,
    private readonly world: string,
    private readonly drivers: Driver[],
    private readonly bankByDriver: Record<string, BankRecord | null>,
    private readonly warn: (message: string) => void = console.warn,
  ) {}

  async signalsFor(driver: Driver, bank: BankRecord | null): Promise<GraphSignals> {
    if (!bank) return { status: "ok", sharedBankAccount: null };
    try {
      await this.db.run(SYNC, {
        world: this.world,
        drivers: this.drivers.map((d, order) => ({
          id: d.id,
          name: d.name,
          fleetOwnerId: d.fleetOwnerId ?? null,
          order,
          accountId: this.bankByDriver[d.id]?.accountId ?? null,
          holderName: this.bankByDriver[d.id]?.holderName ?? null,
        })),
      });
      const rows = await this.db.run(ON_ACCOUNT, { world: this.world, accountId: bank.accountId, ids: this.drivers.map((d) => d.id) });
      const onAccount: OnAccount[] = rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        fleetOwnerId: r.fleetOwnerId === null || r.fleetOwnerId === undefined ? undefined : String(r.fleetOwnerId),
        order: Number(r.order),
      }));
      // The driver being checked counts at their place on the platform even before their own
      // account is recorded, exactly as in the in-memory graph.
      const at = this.drivers.findIndex((d) => d.id === driver.id);
      if (at >= 0 && !onAccount.some((d) => d.id === driver.id)) {
        onAccount.push({ id: driver.id, name: this.drivers[at].name, fleetOwnerId: this.drivers[at].fleetOwnerId, order: at });
        onAccount.sort((a, b) => a.order - b.order);
      }
      return { status: "ok", sharedBankAccount: sharedAccount(driver, bank, onAccount) };
    } catch (err) {
      // Neo4jError messages never carry the password (neo4j.ts).
      this.warn(`Trust graph unavailable, so this case goes to a person: ${err instanceof Error ? err.message : String(err)}`);
      return { status: "unavailable", sharedBankAccount: null };
    }
  }
}

// Start a world over: the demo on every reset, an eval set before it's measured.
export async function clearWorld(db: Neo4j, world: string): Promise<void> {
  await db.run("MATCH (n {world: $world}) WHERE n:Driver OR n:BankAccount DETACH DELETE n", { world });
}

// One node per driver and per account in each world. MERGE alone doesn't promise that when two
// checks sync at once; with the constraint, the loser fails, and its case goes to a person.
export async function ensureSchema(db: Neo4j): Promise<void> {
  // Plain indexes from before the constraints (each constraint brings its own index).
  await db.run("DROP INDEX driver_by_world IF EXISTS");
  await db.run("DROP INDEX account_by_world IF EXISTS");
  await db.run("CREATE CONSTRAINT driver_key IF NOT EXISTS FOR (d:Driver) REQUIRE (d.world, d.id) IS UNIQUE");
  await db.run("CREATE CONSTRAINT account_key IF NOT EXISTS FOR (a:BankAccount) REQUIRE (a.world, a.accountId) IS UNIQUE");
}
