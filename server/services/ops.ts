import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { caseSummary } from "../ai/caseSummary";
import type { DocType, GraphSignals, Notice, PassedCheck, Reason } from "../domain/types";
import { type KycContext, nextStep } from "./kyc";

// Read-only views for the ops console.

export function driversSummary(ctx: KycContext) {
  return ctx.store.listDrivers().map((d) => ({
    id: d.id,
    name: d.name,
    partnerType: d.partnerType,
    status: d.status,
    language: d.language,
    nextStep: nextStep(ctx.store, d),
  }));
}

export function reviewQueue(ctx: KycContext) {
  return ctx.store
    .listDrivers()
    .filter((d) => d.status === "IN_REVIEW")
    .map((d) => {
      const decision = ctx.store.latestDecision(d.id);
      const since = ctx.store.events(d.id).filter((e) => e.toStatus === "IN_REVIEW").at(-1)?.at ?? d.createdAt;
      return {
        id: d.id,
        name: d.name,
        partnerType: d.partnerType,
        since,
        reasons: decision?.reasons.filter((r) => r.severity === "review").map((r) => r.code) ?? [],
      };
    });
}

export interface CaseView {
  driver: { id: string; name: string; phone: string; partnerType: string; status: string; fleetOwnerId?: string; ownerLinkVerified?: boolean };
  decision: { outcome: string; actor: string; at: string; rulesVersion: string | null; reasons: Reason[]; passed: PassedCheck[]; note: string | null } | null;
  notices: Notice[]; // from the latest rules decision: worth knowing, not blocking
  summary: string | null;
  documents: Partial<
    Record<
      DocType,
      { source: string; shotId: string | null; issue: string | null; quality: string | null; fields: Record<string, unknown>; suspiciousText: string | null; readBy: string | null; fallbackReason: string | null }
    >
  >;
  graph: GraphSignals;
  graphSource: string | null; // "Neo4j" when the live graph answered; null for the in-memory one
  events: { at: string; actor: string; type: string; from: string | null; to: string | null }[];
  registrySimulated: boolean;
}

export async function caseView(ctx: KycContext, id: string): Promise<CaseView> {
  const { store } = ctx;
  const d = store.mustGet(id);
  const decision = store.latestDecision(id);
  const docs = store.currentDocuments(id);
  const deps = ctx.world.verifyDeps(store, ctx.clock, ctx.graph);
  const graph = await deps.graph.signalsFor(d, await deps.registry.verifyBank(id));
  return {
    driver: {
      id: d.id,
      name: d.name,
      phone: d.phone,
      partnerType: d.partnerType,
      status: d.status,
      fleetOwnerId: d.fleetOwnerId,
      ownerLinkVerified: d.ownerLinkVerified,
    },
    decision: decision
      ? {
          outcome: decision.outcome,
          actor: decision.actor,
          at: decision.at,
          rulesVersion: decision.rulesVersion,
          reasons: decision.reasons,
          passed: decision.passed,
          note: decision.note,
        }
      : null,
    notices: store.decisions(id).filter((x) => x.actor === "rules").at(-1)?.notices ?? [],
    summary: decision && decision.actor === "rules" ? caseSummary(decision) : null,
    documents: Object.fromEntries(
      (Object.keys(docs) as DocType[]).map((slot) => {
        const doc = docs[slot];
        return [
          slot,
          {
            source: doc?.source ?? "photo",
            shotId: doc?.shotId ?? null,
            issue: doc?.issue ?? null,
            quality: doc?.reading?.quality ?? null,
            fields: doc?.reading?.fields ?? {},
            suspiciousText: doc?.reading?.suspiciousText ?? null,
            readBy: doc?.readBy ?? null,
            fallbackReason: doc?.fallbackReason ?? null,
          },
        ];
      }),
    ),
    graph,
    graphSource: ctx.graph ? (ctx.graphName ?? null) : null,
    events: store.events(id).map((e) => ({ at: e.at, actor: e.actor, type: e.type, from: e.fromStatus, to: e.toStatus })),
    registrySimulated: deps.registry.simulated,
  };
}

export function nudgeLog(ctx: KycContext) {
  const names = new Map(ctx.store.listDrivers().map((d) => [d.id, d.name]));
  return ctx.store
    .nudges()
    .reverse()
    .map((n) => ({
      at: n.at,
      driverId: n.driverId,
      driver: names.get(n.driverId) ?? n.driverId,
      blocker: n.blocker,
      action: n.action,
      reason: n.reason,
      notBefore: n.notBefore,
      text: n.text,
      deepLink: n.deepLink,
      writer: n.writer,
    }));
}

export function funnel(ctx: KycContext) {
  const drivers = ctx.store.listDrivers();
  const reached = (statuses: string[]) =>
    drivers.filter((d) => ctx.store.events(d.id).some((e) => e.toStatus && statuses.includes(e.toStatus))).length;
  const rulesDecisions = drivers.flatMap((d) => ctx.store.decisions(d.id)).filter((x) => x.actor === "rules");
  const sent = ctx.store.nudges().filter((n) => n.action === "send").length;
  const activated = drivers.filter((d) => d.status === "APPROVED" || d.status === "ACTIVE").length;
  return {
    stages: [
      { key: "signed_up", label: "Signed up", count: drivers.length },
      { key: "consented", label: "Consented", count: reached(["CONSENTED"]) },
      { key: "submitted", label: "Submitted", count: reached(["SUBMITTED"]) },
      { key: "approved", label: "Approved", count: reached(["APPROVED"]) },
      { key: "first_trip", label: "First load booked", count: reached(["ACTIVE"]) },
    ],
    now: {
      inReview: drivers.filter((d) => d.status === "IN_REVIEW").length,
      needsFix: drivers.filter((d) => d.status === "NEEDS_FIX").length,
    },
    decidedWithoutPerson: rulesDecisions.length
      ? rulesDecisions.filter((x) => x.outcome !== "REVIEW").length / rulesDecisions.length
      : null,
    nudgesPerActivated: activated ? sent / activated : null,
  };
}

// Headline numbers from the latest eval reports.
export function evalSummaries(resultsDir: string) {
  let files: string[] = [];
  try {
    files = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const order = ["naive", "heuristic", "oracle", "app", "gemma", "claude-sonnet", "claude-opus", "claude-haiku", "qwen"];
  return files
    .map((f) => JSON.parse(readFileSync(path.join(resultsDir, f), "utf8")) as Record<string, unknown>)
    .filter((s) => typeof s.suite === "string" && typeof s.badApproved === "number") // eval summaries only, not other reports
    .map((s) => ({
      suite: String(s.suite ?? "main"),
      reader: String(s.reader),
      readerKind: String(s.readerKind ?? "reference"),
      ranAt: String(s.ranAt),
      rulesVersion: String(s.rulesVersion),
      bad: Number(s.bad),
      badApproved: Number(s.badApproved),
      good: Number(s.good),
      goodApproved: Number(s.goodApproved),
      gatePassed: Boolean(s.gatePassed),
    }))
    .sort((a, b) => a.suite.localeCompare(b.suite) * -1 || order.indexOf(a.reader) - order.indexOf(b.reader));
}
