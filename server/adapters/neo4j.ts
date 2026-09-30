// Neo4j through its HTTPS Query API (D-039): plain fetch, so there's no driver package to install,
// and Aura answers on port 443. One statement per request, with parameters, never string-built Cypher.

export class Neo4jError extends Error {}

export type Row = Record<string, unknown>;

export interface Neo4jConfig {
  uri: string; // neo4j+s://<instance>.databases.neo4j.io, as Aura's credentials file gives it
  username: string;
  password: string;
  database: string; // newer Aura instances name the database after the instance id
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createNeo4j(cfg: Neo4jConfig) {
  const host = new URL(cfg.uri.replace(/^[a-z0-9+]+:/i, "https:")).host;
  const url = `https://${host}/db/${encodeURIComponent(cfg.database)}/query/v2`;
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}`;
  const fetchImpl = cfg.fetchImpl ?? fetch;
  // Error text goes into logs; the password must never ride along with it.
  const redact = (s: string) => (cfg.password ? s.split(cfg.password).join("[hidden]") : s);

  async function run(statement: string, parameters: Record<string, unknown> = {}): Promise<Row[]> {
    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ statement, parameters }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 5_000),
      });
      text = await res.text();
    } catch (err) {
      throw new Neo4jError(redact(`Neo4j unreachable: ${err instanceof Error ? err.message : String(err)}`));
    }
    let body: { data?: { fields?: string[]; values?: unknown[][] }; errors?: { code?: string; message?: string }[] } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // not JSON: reported below
    }
    const problem = body.errors?.[0];
    if (!res.ok || problem) throw new Neo4jError(redact(`Neo4j ${res.status}: ${problem ? `${problem.code ?? ""} ${problem.message ?? ""}` : text.slice(0, 200)}`.trim()));
    const fields = body.data?.fields ?? [];
    return (body.data?.values ?? []).map((values) => Object.fromEntries(fields.map((f, i) => [f, values[i]])));
  }

  return { run, host, database: cfg.database };
}

export type Neo4j = ReturnType<typeof createNeo4j>;

// Neo4j when .env has an instance's credentials, else null (the in-memory graph is used).
export function neo4jFromEnv(env: NodeJS.ProcessEnv = process.env): Neo4j | null {
  if (!env.NEO4J_URI || !env.NEO4J_USERNAME || !env.NEO4J_PASSWORD) return null;
  return createNeo4j({ uri: env.NEO4J_URI, username: env.NEO4J_USERNAME, password: env.NEO4J_PASSWORD, database: env.NEO4J_DATABASE || "neo4j" });
}
