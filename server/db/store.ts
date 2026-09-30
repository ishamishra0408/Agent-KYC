import Database from "better-sqlite3";
import { assertTransition } from "../domain/statusMachine";
import type { VehicleDecision } from "../domain/vehicle";
import type { Actor, BankRecord, DocReading, DocType, Driver, Notice, PartnerType, PassedCheck, Reason, ReasonCode, Status, VehicleRecord } from "../domain/types";

import type { Language } from "../domain/types";
export type { Language } from "../domain/types";

export interface DriverRow extends Driver {
  status: Status;
  optedOut: boolean;
  language: Language;
  createdAt: string;
}

export interface EventRow {
  id: number;
  driverId: string;
  at: string;
  actor: Actor;
  type: string;
  fromStatus: Status | null;
  toStatus: Status | null;
  payload: Record<string, unknown> | null;
}

export interface DecisionRow {
  id: number;
  driverId: string;
  at: string;
  actor: Actor;
  outcome: string;
  reasons: Reason[];
  passed: PassedCheck[];
  notices: Notice[];
  rulesVersion: string | null;
  note: string | null;
  // What a person's decision was based on, frozen when they made it: the rules' decision they were
  // shown, the documents as read, and whether the note began as a copilot draft (D-048). Empty for rules.
  evidence: Record<string, unknown>;
}

export interface VehicleRow {
  at: string;
  number: string;
  record: VehicleRecord | null;
  outcome: VehicleDecision["outcome"];
  reasons: VehicleDecision["reasons"];
  passed: VehicleDecision["passed"];
  rulesVersion: string;
}

export type NudgeAction = "send" | "status_update" | "hold";

export interface NudgeRow {
  id: number;
  driverId: string;
  at: string;
  forStatus: Status;
  blocker: string;
  action: NudgeAction;
  reason: string;
  notBefore: string | null;
  text: string | null;
  writer: string | null;
  deepLink: string | null; // where tapping the notification lands: the stuck step
}

export type DocSource = "photo" | "digilocker";

export interface DocumentRow {
  id: number;
  driverId: string;
  at: string;
  slot: DocType;
  source: DocSource;
  shotId: string | null; // which SPECIMEN photo was taken (demo camera)
  reading: DocReading | null; // what the reader saw; null for DigiLocker
  issue: ReasonCode | null; // instant photo verdict, same standard as the rules
  readBy?: string | null; // "simulated" or the model that read the photo (D-038); null for DigiLocker
  fallbackReason?: string | null; // why the fallback model read it, if it did
}

export type StepName = "bank_check" | "selfie";

export type ChatRole = "assistant" | "driver" | "system";

export interface ChatRow {
  id: number;
  driverId: string;
  at: string;
  role: ChatRole;
  author: string; // "assistant (scripted)", "rules", "reviewer", "driver"
  text: string;
}

export interface BookingRow {
  id: number;
  driverId: string;
  loadId: string;
  at: string;
}

export class OwnerLinkError extends Error {}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  partner_type TEXT NOT NULL,
  fleet_owner_id TEXT,
  owner_link_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  opted_out INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  payload TEXT
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reasons TEXT NOT NULL,
  passed TEXT NOT NULL DEFAULT '[]',
  notices TEXT NOT NULL DEFAULT '[]',
  rules_version TEXT,
  note TEXT,
  evidence TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS bank_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  account_last4 TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  record TEXT
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  number TEXT NOT NULL,
  record TEXT,
  outcome TEXT NOT NULL,
  reasons TEXT NOT NULL,
  passed TEXT NOT NULL,
  rules_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  for_status TEXT NOT NULL,
  blocker TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  not_before TEXT,
  text TEXT,
  writer TEXT,
  deep_link TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  slot TEXT NOT NULL,
  source TEXT NOT NULL,
  shot_id TEXT,
  reading TEXT,
  issue TEXT,
  read_by TEXT,
  fallback_reason TEXT
);
CREATE TABLE IF NOT EXISTS steps (
  driver_id TEXT NOT NULL,
  step TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (driver_id, step)
);
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  at TEXT NOT NULL,
  role TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id TEXT NOT NULL,
  load_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_driver ON events (driver_id, id);
CREATE INDEX IF NOT EXISTS nudges_by_driver ON nudges (driver_id, id);
CREATE INDEX IF NOT EXISTS documents_by_driver ON documents (driver_id, id);
CREATE INDEX IF NOT EXISTS chat_by_driver ON chat (driver_id, id);

-- The audit trail can be added to, never rewritten.
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS bank_attempts_no_update BEFORE UPDATE ON bank_attempts
  BEGIN SELECT RAISE(ABORT, 'bank_attempts is append-only'); END;
CREATE TRIGGER IF NOT EXISTS bank_attempts_no_delete BEFORE DELETE ON bank_attempts
  BEGIN SELECT RAISE(ABORT, 'bank_attempts is append-only'); END;
CREATE TRIGGER IF NOT EXISTS vehicles_no_update BEFORE UPDATE ON vehicles
  BEGIN SELECT RAISE(ABORT, 'vehicles is append-only'); END;
CREATE TRIGGER IF NOT EXISTS vehicles_no_delete BEFORE DELETE ON vehicles
  BEGIN SELECT RAISE(ABORT, 'vehicles is append-only'); END;
CREATE TRIGGER IF NOT EXISTS decisions_no_update BEFORE UPDATE ON decisions
  BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS decisions_no_delete BEFORE DELETE ON decisions
  BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
`;

interface RawDriver {
  id: string;
  name: string;
  phone: string;
  partner_type: string;
  fleet_owner_id: string | null;
  owner_link_verified: number;
  status: string;
  opted_out: number;
  language: string;
  created_at: string;
}

interface RawEvent {
  id: number;
  driver_id: string;
  at: string;
  actor: string;
  type: string;
  from_status: string | null;
  to_status: string | null;
  payload: string | null;
}

interface RawDecision {
  id: number;
  driver_id: string;
  at: string;
  actor: string;
  outcome: string;
  reasons: string;
  passed: string;
  notices: string;
  rules_version: string | null;
  note: string | null;
  evidence: string;
}

interface RawNudge {
  id: number;
  driver_id: string;
  at: string;
  for_status: string;
  blocker: string;
  action: string;
  reason: string;
  not_before: string | null;
  text: string | null;
  writer: string | null;
  deep_link: string | null;
}

function toDriver(r: RawDriver): DriverRow {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    partnerType: r.partner_type as PartnerType,
    fleetOwnerId: r.fleet_owner_id ?? undefined,
    ownerLinkVerified: r.owner_link_verified === 1,
    status: r.status as Status,
    optedOut: r.opted_out === 1,
    language: r.language as Language,
    createdAt: r.created_at,
  };
}

function toEvent(r: RawEvent): EventRow {
  return {
    id: r.id,
    driverId: r.driver_id,
    at: r.at,
    actor: r.actor as Actor,
    type: r.type,
    fromStatus: r.from_status as Status | null,
    toStatus: r.to_status as Status | null,
    payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
  };
}

function toDecision(r: RawDecision): DecisionRow {
  return {
    id: r.id,
    driverId: r.driver_id,
    at: r.at,
    actor: r.actor as Actor,
    outcome: r.outcome,
    reasons: JSON.parse(r.reasons) as Reason[],
    passed: JSON.parse(r.passed) as PassedCheck[],
    notices: JSON.parse(r.notices) as Notice[],
    rulesVersion: r.rules_version,
    note: r.note,
    evidence: JSON.parse(r.evidence || "{}") as Record<string, unknown>,
  };
}

function toNudge(r: RawNudge): NudgeRow {
  return {
    id: r.id,
    driverId: r.driver_id,
    at: r.at,
    forStatus: r.for_status as Status,
    blocker: r.blocker,
    action: r.action as NudgeAction,
    reason: r.reason,
    notBefore: r.not_before,
    text: r.text,
    writer: r.writer,
    deepLink: r.deep_link,
  };
}

// Status plus an append-only event log. Every status change goes through move(),
// which enforces the status machine. The database handle stays private, so no caller
// can write around it.
export class Store {
  private readonly db: Database.Database;

  constructor(path = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // New drivers always start unconfirmed; only their fleet owner can confirm them.
  addDriver(d: Driver, now: Date, language: Language = "en"): DriverRow {
    const at = now.toISOString();
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO drivers (id, name, phone, partner_type, fleet_owner_id, owner_link_verified, status, opted_out, language, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 'SIGNED_UP', 0, ?, ?)`,
        )
        .run(d.id, d.name, d.phone, d.partnerType, d.fleetOwnerId ?? null, language, at);
      this.logEvent(d.id, at, "driver", "signed_up", null, "SIGNED_UP", null);
    });
    return this.mustGet(d.id);
  }

  getDriver(id: string): DriverRow | undefined {
    const r = this.db.prepare("SELECT * FROM drivers WHERE id = ?").get(id) as RawDriver | undefined;
    return r ? toDriver(r) : undefined;
  }

  mustGet(id: string): DriverRow {
    const d = this.getDriver(id);
    if (!d) throw new Error(`Unknown driver ${id}`);
    return d;
  }

  listDrivers(): DriverRow[] {
    return (this.db.prepare("SELECT * FROM drivers ORDER BY id").all() as RawDriver[]).map(toDriver);
  }

  isVerified(id: string): boolean {
    const d = this.getDriver(id);
    return d?.status === "APPROVED" || d?.status === "ACTIVE";
  }

  move(id: string, to: Status, actor: Actor, now: Date, payload?: Record<string, unknown>): DriverRow {
    this.transaction(() => {
      const d = this.mustGet(id);
      assertTransition(d.status, to, actor);
      this.db.prepare("UPDATE drivers SET status = ? WHERE id = ?").run(to, id);
      this.logEvent(id, now.toISOString(), actor, "status_changed", d.status, to, payload ?? null);
    });
    return this.mustGet(id);
  }

  setOptedOut(id: string, optedOut: boolean, now: Date): void {
    this.transaction(() => {
      this.mustGet(id);
      this.db.prepare("UPDATE drivers SET opted_out = ? WHERE id = ?").run(optedOut ? 1 : 0, id);
      this.logEvent(id, now.toISOString(), "driver", optedOut ? "opted_out" : "opted_in", null, null, null);
    });
  }

  // The fleet owner the driver named, and nobody else, confirms that the driver works for them.
  confirmOwnerLink(driverId: string, ownerId: string, now: Date): DriverRow {
    this.transaction(() => {
      const d = this.mustGet(driverId);
      const owner = this.mustGet(ownerId);
      if (d.partnerType !== "hired_driver") throw new OwnerLinkError("Only hired drivers have a fleet owner.");
      if (d.fleetOwnerId !== ownerId) throw new OwnerLinkError("Only the fleet owner this driver named can confirm them.");
      if (owner.partnerType !== "fleet_owner") throw new OwnerLinkError("Only a fleet owner can confirm a driver.");
      this.db.prepare("UPDATE drivers SET owner_link_verified = 1 WHERE id = ?").run(driverId);
      this.logEvent(driverId, now.toISOString(), "driver", "owner_confirmed", null, null, { confirmedBy: ownerId });
    });
    return this.mustGet(driverId);
  }

  recordDecision(
    driverId: string,
    actor: Actor,
    outcome: string,
    reasons: readonly Reason[],
    passed: readonly PassedCheck[],
    rulesVersion: string | null,
    now: Date,
    note: string | null = null,
    notices: readonly Notice[] = [],
    evidence: Record<string, unknown> = {},
  ): void {
    this.db
      .prepare(
        "INSERT INTO decisions (driver_id, at, actor, outcome, reasons, passed, notices, rules_version, note, evidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        driverId,
        now.toISOString(),
        actor,
        outcome,
        JSON.stringify(reasons),
        JSON.stringify(passed),
        JSON.stringify(notices),
        rulesVersion,
        note,
        JSON.stringify(evidence),
      );
  }

  // A vehicle decision (D-049), with the registry's answer it was made on.
  recordVehicleDecision(driverId: string, now: Date, number: string, record: VehicleRecord | null, d: VehicleDecision): void {
    this.db
      .prepare("INSERT INTO vehicles (driver_id, at, number, record, outcome, reasons, passed, rules_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(driverId, now.toISOString(), number, record ? JSON.stringify(record) : null, d.outcome, JSON.stringify(d.reasons), JSON.stringify(d.passed), d.rulesVersion);
  }

  latestVehicle(driverId: string): VehicleRow | undefined {
    const r = this.db.prepare("SELECT * FROM vehicles WHERE driver_id = ? ORDER BY id DESC LIMIT 1").get(driverId) as
      | { at: string; number: string; record: string | null; outcome: string; reasons: string; passed: string; rules_version: string }
      | undefined;
    return r
      ? {
          at: r.at,
          number: r.number,
          record: r.record ? (JSON.parse(r.record) as VehicleRecord) : null,
          outcome: r.outcome as VehicleDecision["outcome"],
          reasons: JSON.parse(r.reasons) as VehicleDecision["reasons"],
          passed: JSON.parse(r.passed) as VehicleDecision["passed"],
          rulesVersion: r.rules_version,
        }
      : undefined;
  }

  // A penny drop, found or not (D-049). The record is the bank's answer; null means no such account.
  recordBankAttempt(driverId: string, now: Date, attempt: { last4: string; ifsc: string; record: BankRecord | null }): void {
    this.db
      .prepare("INSERT INTO bank_attempts (driver_id, at, account_last4, ifsc, record) VALUES (?, ?, ?, ?, ?)")
      .run(driverId, now.toISOString(), attempt.last4, attempt.ifsc, attempt.record ? JSON.stringify(attempt.record) : null);
  }

  bankAttempts(driverId: string): { at: string; last4: string; ifsc: string; record: BankRecord | null }[] {
    return (
      this.db.prepare("SELECT at, account_last4, ifsc, record FROM bank_attempts WHERE driver_id = ? ORDER BY id").all(driverId) as {
        at: string;
        account_last4: string;
        ifsc: string;
        record: string | null;
      }[]
    ).map((r) => ({ at: r.at, last4: r.account_last4, ifsc: r.ifsc, record: r.record ? (JSON.parse(r.record) as BankRecord) : null }));
  }

  // The account linked by the latest penny drop that found one.
  linkedBank(driverId: string): BankRecord | null {
    return this.bankAttempts(driverId).filter((a) => a.record !== null).at(-1)?.record ?? null;
  }

  latestDecision(driverId: string): DecisionRow | undefined {
    const r = this.db
      .prepare("SELECT * FROM decisions WHERE driver_id = ? ORDER BY id DESC LIMIT 1")
      .get(driverId) as RawDecision | undefined;
    return r ? toDecision(r) : undefined;
  }

  decisions(driverId: string): DecisionRow[] {
    return (
      this.db.prepare("SELECT * FROM decisions WHERE driver_id = ? ORDER BY id").all(driverId) as RawDecision[]
    ).map(toDecision);
  }

  // Fix reasons from each NEEDS_FIX decision since the last approval, oldest first. Feeds the
  // repeated-fix rule; fixes asked for before an approval don't count against a later renewal.
  priorFixReasons(driverId: string): ReasonCode[][] {
    const all = this.decisions(driverId);
    return all
      .slice(all.map((d) => d.outcome).lastIndexOf("APPROVE") + 1)
      .filter((d) => d.outcome === "NEEDS_FIX")
      .map((d) => d.reasons.filter((r) => r.severity === "fix").map((r) => r.code));
  }

  recordNudge(n: Omit<NudgeRow, "id">): void {
    this.db
      .prepare(
        `INSERT INTO nudges (driver_id, at, for_status, blocker, action, reason, not_before, text, writer, deep_link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(n.driverId, n.at, n.forStatus, n.blocker, n.action, n.reason, n.notBefore, n.text, n.writer, n.deepLink);
  }

  lastNudge(driverId: string): NudgeRow | undefined {
    const r = this.db
      .prepare("SELECT * FROM nudges WHERE driver_id = ? ORDER BY id DESC LIMIT 1")
      .get(driverId) as RawNudge | undefined;
    return r ? toNudge(r) : undefined;
  }

  lastSentNudgeAt(driverId: string): Date | null {
    const r = this.db
      .prepare("SELECT at FROM nudges WHERE driver_id = ? AND action = 'send' ORDER BY id DESC LIMIT 1")
      .get(driverId) as { at: string } | undefined;
    return r ? new Date(r.at) : null;
  }

  // Has this driver had a status update since they last entered `status`?
  statusUpdateSent(driverId: string, status: Status): boolean {
    const entered = this.db
      .prepare("SELECT at FROM events WHERE driver_id = ? AND to_status = ? ORDER BY id DESC LIMIT 1")
      .get(driverId, status) as { at: string } | undefined;
    if (!entered) return false;
    const r = this.db
      .prepare(
        "SELECT 1 FROM nudges WHERE driver_id = ? AND action = 'status_update' AND for_status = ? AND at >= ? LIMIT 1",
      )
      .get(driverId, status, entered.at);
    return r !== undefined;
  }

  nudges(driverId?: string): NudgeRow[] {
    const rows = driverId
      ? (this.db.prepare("SELECT * FROM nudges WHERE driver_id = ? ORDER BY id").all(driverId) as RawNudge[])
      : (this.db.prepare("SELECT * FROM nudges ORDER BY id").all() as RawNudge[]);
    return rows.map(toNudge);
  }

  events(driverId: string): EventRow[] {
    return (
      this.db.prepare("SELECT * FROM events WHERE driver_id = ? ORDER BY id").all(driverId) as RawEvent[]
    ).map(toEvent);
  }

  setLanguage(id: string, language: Language): void {
    this.mustGet(id);
    this.db.prepare("UPDATE drivers SET language = ? WHERE id = ?").run(language, id);
  }

  addDocument(d: Omit<DocumentRow, "id">): void {
    this.mustGet(d.driverId);
    this.db
      .prepare("INSERT INTO documents (driver_id, at, slot, source, shot_id, reading, issue, read_by, fallback_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(d.driverId, d.at, d.slot, d.source, d.shotId, d.reading ? JSON.stringify(d.reading) : null, d.issue, d.readBy ?? null, d.fallbackReason ?? null);
  }

  // The latest document per slot: what the driver would submit right now.
  currentDocuments(driverId: string): Partial<Record<DocType, DocumentRow>> {
    const rows = this.db.prepare("SELECT * FROM documents WHERE driver_id = ? ORDER BY id").all(driverId) as {
      id: number;
      driver_id: string;
      at: string;
      slot: string;
      source: string;
      shot_id: string | null;
      reading: string | null;
      issue: string | null;
      read_by: string | null;
      fallback_reason: string | null;
    }[];
    const out: Partial<Record<DocType, DocumentRow>> = {};
    for (const r of rows) {
      out[r.slot as DocType] = {
        id: r.id,
        driverId: r.driver_id,
        at: r.at,
        slot: r.slot as DocType,
        source: r.source as DocSource,
        shotId: r.shot_id,
        reading: r.reading ? (JSON.parse(r.reading) as DocReading) : null,
        issue: r.issue as ReasonCode | null,
        readBy: r.read_by,
        fallbackReason: r.fallback_reason,
      };
    }
    return out;
  }

  markStep(driverId: string, step: StepName, now: Date): void {
    this.mustGet(driverId);
    this.db.prepare("INSERT OR IGNORE INTO steps (driver_id, step, at) VALUES (?, ?, ?)").run(driverId, step, now.toISOString());
  }

  hasStep(driverId: string, step: StepName): boolean {
    return this.db.prepare("SELECT 1 FROM steps WHERE driver_id = ? AND step = ?").get(driverId, step) !== undefined;
  }

  addChat(driverId: string, role: ChatRole, author: string, text: string, now: Date): void {
    this.db
      .prepare("INSERT INTO chat (driver_id, at, role, author, text) VALUES (?, ?, ?, ?, ?)")
      .run(driverId, now.toISOString(), role, author, text);
  }

  chat(driverId: string): ChatRow[] {
    return (
      this.db.prepare("SELECT * FROM chat WHERE driver_id = ? ORDER BY id").all(driverId) as {
        id: number;
        driver_id: string;
        at: string;
        role: string;
        author: string;
        text: string;
      }[]
    ).map((r) => ({ id: r.id, driverId: r.driver_id, at: r.at, role: r.role as ChatRole, author: r.author, text: r.text }));
  }

  addBooking(driverId: string, loadId: string, now: Date): void {
    this.db.prepare("INSERT INTO bookings (driver_id, load_id, at) VALUES (?, ?, ?)").run(driverId, loadId, now.toISOString());
  }

  bookings(driverId: string): BookingRow[] {
    return (
      this.db.prepare("SELECT * FROM bookings WHERE driver_id = ? ORDER BY id").all(driverId) as {
        id: number;
        driver_id: string;
        load_id: string;
        at: string;
      }[]
    ).map((r) => ({ id: r.id, driverId: r.driver_id, loadId: r.load_id, at: r.at }));
  }

  private logEvent(
    driverId: string,
    at: string,
    actor: Actor,
    type: string,
    from: Status | null,
    to: Status | null,
    payload: Record<string, unknown> | null,
  ): void {
    this.db
      .prepare(
        "INSERT INTO events (driver_id, at, actor, type, from_status, to_status, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(driverId, at, actor, type, from, to, payload ? JSON.stringify(payload) : null);
  }
}
