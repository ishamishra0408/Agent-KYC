import { describe, expect, it } from "vitest";
import { InMemoryGraph } from "../server/adapters/graph";
import { createNeo4j, type Neo4j, Neo4jError, type Row } from "../server/adapters/neo4j";
import { Neo4jGraph } from "../server/adapters/neo4jGraph";
import type { BankRecord, Driver } from "../server/domain/types";

const driver = (id: string, name: string, extra: Partial<Driver> = {}): Driver => ({
  id,
  name,
  phone: "+91 00000 00000",
  partnerType: "owner_driver",
  ...extra,
});

const account = (accountId: string, holderName: string): BankRecord => ({
  accountId,
  holderName,
  accountLast4: "0000",
  ifsc: "SPEC0000101",
});

const raju = driver("o1", "Raju Naik", { partnerType: "fleet_owner" });
const anand = driver("h1", "Anand Rao", { partnerType: "hired_driver", fleetOwnerId: "o1", ownerLinkVerified: true });
const x = driver("x", "Vikram S");
const y = driver("y", "Arun P");
const z = driver("z", "Mahesh T");

const rajuAcct = account("acct-raju", "RAJU NAIK");
const ringAcct = account("acct-ring", "BALU M"); // holder isn't any of the drivers using it

const graph = new InMemoryGraph([raju, anand, x, y, z], { o1: rajuAcct, h1: rajuAcct, x: ringAcct, y: ringAcct, z: ringAcct });

describe("InMemoryGraph", () => {
  it("sees a fleet: owner holds the account, the driver names the owner", async () => {
    const s = await graph.signalsFor(anand, rajuAcct);
    expect(s.sharedBankAccount?.sharers.every((p) => p.isHolder || p.claimsHolderAsOwner)).toBe(true);
  });

  it("sees a ring: strangers share an account none of them hold", async () => {
    const s = await graph.signalsFor(x, ringAcct);
    expect(s.sharedBankAccount?.sharers).toHaveLength(3);
    expect(s.sharedBankAccount?.sharers.some((p) => !p.isHolder && !p.claimsHolderAsOwner)).toBe(true);
  });

  it("reports nothing for an account used by one driver", async () => {
    const solo = driver("s", "Solo Driver");
    const g = new InMemoryGraph([solo], { s: account("acct-solo", "SOLO DRIVER") });
    expect((await g.signalsFor(solo, account("acct-solo", "SOLO DRIVER"))).sharedBankAccount).toBeNull();
  });
});

// A stand-in for Neo4j that answers the adapter's two statements from what it was sent. Like MERGE,
// a sync updates the drivers it names and leaves the rest as they were; "who is on this account"
// comes back in platform order.
type Synced = { id: string; name: string; fleetOwnerId: string | null; order: number; accountId: string | null };
function fakeNeo4j(): Neo4j & { statements: string[] } {
  const worlds = new Map<string, Map<string, Synced>>();
  const statements: string[] = [];
  return {
    host: "fake",
    database: "fake",
    statements,
    async run(statement: string, params: Record<string, unknown> = {}): Promise<Row[]> {
      statements.push(statement.trim().split("\n")[0]);
      const world = worlds.get(String(params.world)) ?? new Map<string, Synced>();
      worlds.set(String(params.world), world);
      if (statement.includes("UNWIND $drivers")) {
        for (const d of params.drivers as Synced[]) world.set(d.id, d);
        return [];
      }
      return [...world.values()]
        .filter((d) => d.accountId === params.accountId && (params.ids as string[]).includes(d.id))
        .sort((a, b) => a.order - b.order)
        .map((d) => ({ id: d.id, name: d.name, fleetOwnerId: d.fleetOwnerId, order: d.order }));
    },
  };
}

describe("Neo4jGraph (D-039)", () => {
  const drivers = [raju, anand, x, y, z];
  const banks = { o1: rajuAcct, h1: rajuAcct, x: ringAcct, y: ringAcct, z: ringAcct };

  it("gives the same signals as the in-memory graph, sharers in the same order", async () => {
    const neo = new Neo4jGraph(fakeNeo4j(), "test", drivers, banks);
    const mem = new InMemoryGraph(drivers, banks);
    for (const d of drivers) {
      const bank = banks[d.id as keyof typeof banks];
      expect(await neo.signalsFor(d, bank)).toEqual(await mem.signalsFor(d, bank));
    }
    // A driver whose own account isn't recorded yet still counts at their place, as in memory.
    const newcomer = driver("n", "New Comer");
    const both = [...drivers.slice(0, 2), newcomer, ...drivers.slice(2)];
    expect(await new Neo4jGraph(fakeNeo4j(), "test", both, banks).signalsFor(newcomer, ringAcct)).toEqual(
      await new InMemoryGraph(both, banks).signalsFor(newcomer, ringAcct),
    );
  });

  it("says it couldn't answer, never 'no shared account', when Neo4j fails", async () => {
    const down: Neo4j = {
      host: "down",
      database: "down",
      run: async () => {
        throw new Neo4jError("Neo4j unreachable: paused");
      },
    };
    const warnings: string[] = [];
    expect(await new Neo4jGraph(down, "test", drivers, banks, (m) => warnings.push(m)).signalsFor(x, ringAcct)).toEqual({ status: "unavailable", sharedBankAccount: null });
    expect(warnings).toEqual(["Trust graph unavailable, so this case goes to a person: Neo4j unreachable: paused"]);
  });

  it("counts only the drivers on the platform now, not one left over from an earlier check", async () => {
    const db = fakeNeo4j();
    await new Neo4jGraph(db, "test", drivers, banks).signalsFor(x, ringAcct);
    const now = drivers.filter((d) => d.id !== "z"); // z has left since
    const nowBanks = { o1: rajuAcct, h1: rajuAcct, x: ringAcct, y: ringAcct };
    const s = await new Neo4jGraph(db, "test", now, nowBanks).signalsFor(x, ringAcct);
    expect(s).toEqual(await new InMemoryGraph(now, nowBanks).signalsFor(x, ringAcct));
    expect(s.sharedBankAccount?.sharers.map((p) => p.driverId)).toEqual(["x", "y"]);
  });

  it("syncs, then asks, on every check", async () => {
    const db = fakeNeo4j();
    await new Neo4jGraph(db, "test", drivers, banks).signalsFor(x, ringAcct);
    expect(db.statements).toEqual(["UNWIND $drivers AS d", "MATCH (d:Driver {world: $world})-[:PAID_INTO]->(:BankAccount {world: $world, accountId: $accountId})"]);
  });
});

describe("the Neo4j Query API client", () => {
  const SECRET = "not-a-real-password";
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("posts one parameterised statement to the instance's database over HTTPS", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ data: { fields: ["id", "n"], values: [["a", 1], ["b", 2]] } }), { status: 202 });
    }) as unknown as typeof fetch;
    const db = createNeo4j({ uri: "neo4j+s://abc123.databases.neo4j.io", username: "abc123", password: SECRET, database: "abc123", fetchImpl: impl });
    expect(await db.run("MATCH (n) WHERE n.id = $id RETURN n.id AS id, 1 AS n", { id: "a" })).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    expect(seen[0].url).toBe("https://abc123.databases.neo4j.io/db/abc123/query/v2");
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`abc123:${SECRET}`).toString("base64")}`);
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ statement: "MATCH (n) WHERE n.id = $id RETURN n.id AS id, 1 AS n", parameters: { id: "a" } });
  });

  it("turns Neo4j's errors into a Neo4jError without the password", async () => {
    const db = createNeo4j({
      uri: "neo4j+s://abc123.databases.neo4j.io",
      username: "abc123",
      password: SECRET,
      database: "abc123",
      fetchImpl: reply(401, { errors: [{ code: "Neo.ClientError.Security.Unauthorized", message: `bad credentials ${SECRET}` }] }),
    });
    const err = await db.run("RETURN 1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Neo4jError);
    expect((err as Error).message).toContain("Unauthorized");
    expect((err as Error).message).not.toContain(SECRET);
  });
});
