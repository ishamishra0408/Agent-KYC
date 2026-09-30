import express, { type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { OwnerLinkError } from "../db/store";
import { LOADS } from "../demo/loads";
import { SHOT_VARIANTS, type ShotVariant } from "../demo/shots";
import { ManualClock } from "../domain/clock";
import { TransitionError } from "../domain/statusMachine";
import { mockNudgeWriter } from "../ai/mockNudgeWriter";
import { DRAFT_WRITER } from "../ai/reviewDraft";
import { runNudgeCycle } from "../services/nudges";
import {
  addVehicle,
  ask,
  bankCheck,
  BankDetailsError,
  BankTriesError,
  book,
  consent,
  driverView,
  KycError,
  ownerConfirms,
  reviewerDecision,
  submit,
  takePhoto,
  takeSelfie,
  useDigilocker,
  VehicleNumberError,
  type KycContext,
} from "../services/kyc";
import { DecisionRefusedError, MissingReasonError } from "../services/onboarding";
import { caseView, driversSummary, evalSummaries, funnel, nudgeLog, reviewDraftFor, reviewQueue } from "../services/ops";

export interface AppDeps {
  ctx: KycContext; // mutable: reset swaps the store and clock
  specimenDir: string;
  resultsDir: string;
  reset: () => Promise<void>;
  webDir?: string; // the built app (dist/), served when hosted; local, Vite serves it
}

const Slot = z.enum(["DL", "PAN", "BANK_PROOF"]);
const PhotoBody = z.object({ slot: Slot, variant: z.enum(SHOT_VARIANTS) });
const DigiBody = z.object({ slot: z.enum(["DL", "PAN"]) });
const AskBody = z.object({ faq: z.enum(["why_bank", "data_safe", "no_pan", "person"]) });
const LangBody = z.object({ language: z.enum(["en", "hi"]) });
const OptOutBody = z.object({ optedOut: z.boolean() });
const DecisionBody = z
  .object({
    choice: z.enum(["APPROVE", "NEEDS_FIX", "REJECT"]),
    note: z.string().max(500),
    step: z.enum(["DL", "PAN", "BANK", "SELFIE"]).optional(),
    draft: z.enum([DRAFT_WRITER]).optional(), // who wrote the note's first draft, if the copilot did (D-048)
  })
  .refine((b) => b.choice !== "NEEDS_FIX" || b.step !== undefined, { message: "Pick the step the driver should redo." });
const DraftQuery = z.object({ choice: z.enum(["APPROVE", "NEEDS_FIX", "REJECT"]), step: z.enum(["DL", "PAN", "BANK", "SELFIE"]).optional() });
const BankBody = z.object({ accountNumber: z.string().min(1).max(30), ifsc: z.string().min(1).max(20) });
const VehicleBody = z.object({ number: z.string().min(1).max(20) });
const AdvanceBody = z.object({ hours: z.number().int().min(1).max(24 * 7) });

export function shotUrl(shotId: string | null): string | null {
  return shotId ? `/specimens/demo/${shotId}.jpg` : null;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  const { ctx } = deps;
  app.use(express.json({ limit: "100kb" }));
  app.use("/specimens", express.static(deps.specimenDir, { fallthrough: false }));
  // The app routes with #/..., so the files themselves are all it needs.
  if (deps.webDir) app.use(express.static(deps.webDir));

  const id = (req: Request) => {
    const driverId = String(req.params.id);
    ctx.store.mustGet(driverId);
    return driverId;
  };

  // ---------- Demo ----------
  app.get("/api/state", (_req, res) => {
    res.json({ clock: ctx.clock.now().toISOString(), drivers: driversSummary(ctx) });
  });

  app.post("/api/demo/advance", async (req, res) => {
    const { hours } = AdvanceBody.parse(req.body);
    if (!(ctx.clock instanceof ManualClock)) throw new KycError("The clock can only move in demo mode.", 400);
    ctx.clock.advanceHours(hours);
    const items = await runNudgeCycle(ctx.store, mockNudgeWriter, ctx.clock.now());
    res.json({ clock: ctx.clock.now().toISOString(), cycle: items });
  });

  app.post("/api/demo/reset", async (_req, res) => {
    await deps.reset();
    res.json({ ok: true });
  });

  // ---------- Driver app ----------
  app.get("/api/drivers/:id", (req, res) => {
    const view = driverView(ctx, id(req));
    res.json({
      ...view,
      documents: Object.fromEntries(
        Object.entries(view.documents).map(([slot, doc]) => [slot, doc && { ...doc, url: shotUrl(doc.shotId) }]),
      ),
    });
  });

  app.get("/api/drivers/:id/shots/:slot", (req, res) => {
    const driverId = id(req);
    const slot = Slot.parse(req.params.slot);
    res.json(
      SHOT_VARIANTS.map((variant: ShotVariant) => {
        const shot = ctx.world.shot(driverId, slot, variant);
        return shot && { variant, url: shotUrl(shot.id) };
      }).filter(Boolean),
    );
  });

  app.post("/api/drivers/:id/consent", (req, res) => {
    consent(ctx, id(req));
    res.json({ ok: true });
  });

  app.post("/api/drivers/:id/photo", async (req, res) => {
    const { slot, variant } = PhotoBody.parse(req.body);
    res.json(await takePhoto(ctx, id(req), slot, variant));
  });

  app.post("/api/drivers/:id/digilocker", (req, res) => {
    useDigilocker(ctx, id(req), DigiBody.parse(req.body).slot);
    res.json({ ok: true });
  });

  // The penny drop (D-049): the driver's account number and IFSC, checked with the (simulated) bank.
  app.post("/api/drivers/:id/bank-check", async (req, res) => {
    const { accountNumber, ifsc } = BankBody.parse(req.body);
    res.json(await bankCheck(ctx, id(req), accountNumber, ifsc));
  });

  app.post("/api/drivers/:id/selfie", (req, res) => {
    takeSelfie(ctx, id(req));
    res.json({ ok: true });
  });

  app.post("/api/drivers/:id/submit", async (req, res) => {
    const decision = await submit(ctx, id(req));
    res.json({ outcome: decision.outcome });
  });

  app.post("/api/drivers/:id/ask", (req, res) => {
    ask(ctx, id(req), AskBody.parse(req.body).faq);
    res.json({ ok: true });
  });

  app.post("/api/drivers/:id/language", (req, res) => {
    ctx.store.setLanguage(id(req), LangBody.parse(req.body).language);
    res.json({ ok: true });
  });

  app.post("/api/drivers/:id/opt-out", (req, res) => {
    ctx.store.setOptedOut(id(req), OptOutBody.parse(req.body).optedOut, ctx.clock.now());
    res.json({ ok: true });
  });

  // The bookings lock, over HTTP: 403 until the driver is approved.
  app.get("/api/drivers/:id/loads", (req, res) => {
    const view = driverView(ctx, id(req));
    if (!view.canBook) {
      const vehicle = view.vehicle.needed;
      res.status(403).json({ error: vehicle ? "Add a verified vehicle to book loads." : "Finish verification to book loads.", nextStep: vehicle ? "VEHICLE" : view.nextStep });
      return;
    }
    res.json({ loads: LOADS, bookings: view.bookings });
  });

  // The vehicle step (D-049): a registration number, checked with the (simulated) registry and decided by the vehicle policy.
  app.post("/api/drivers/:id/vehicle", async (req, res) => {
    const { number } = VehicleBody.parse(req.body);
    res.json(await addVehicle(ctx, id(req), number));
  });

  app.post("/api/drivers/:id/loads/:loadId/book", (req, res) => {
    const r = book(ctx, id(req), String(req.params.loadId));
    if (!r.ok) {
      res.status(r.httpStatus).json({ error: r.message });
      return;
    }
    res.json(r);
  });

  // ---------- Ops console ----------
  app.get("/api/ops/review", (_req, res) => {
    res.json(reviewQueue(ctx));
  });

  app.get("/api/ops/drivers/:id/case", async (req, res) => {
    const view = await caseView(ctx, id(req));
    res.json({
      ...view,
      documents: Object.fromEntries(
        Object.entries(view.documents).map(([slot, doc]) => [slot, doc && { ...doc, url: shotUrl(doc.shotId) }]),
      ),
    });
  });

  // The reviewer's copilot: a first draft of the note, which the reviewer edits (D-048).
  app.get("/api/ops/drivers/:id/draft", (req, res) => {
    const { choice, step } = DraftQuery.parse(req.query);
    res.json(reviewDraftFor(ctx, id(req), choice, step));
  });

  app.post("/api/ops/drivers/:id/decision", (req, res) => {
    const { choice, note, step, draft } = DecisionBody.parse(req.body);
    const d = reviewerDecision(ctx, id(req), choice, note, step, draft);
    res.json({ status: d.status });
  });

  // Demo only: stands in for the fleet owner confirming a hired driver in their own app.
  app.post("/api/ops/drivers/:id/confirm-owner", (req, res) => {
    const d = ownerConfirms(ctx, id(req));
    res.json({ ownerLinkVerified: d.ownerLinkVerified });
  });

  app.get("/api/ops/nudges", (_req, res) => {
    res.json(nudgeLog(ctx));
  });

  app.get("/api/ops/funnel", (_req, res) => {
    res.json(funnel(ctx));
  });

  app.get("/api/ops/evals", (_req, res) => {
    res.json(evalSummaries(deps.resultsDir));
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Invalid request.", issues: err.issues.map((i) => i.message) });
    } else if (err instanceof KycError) {
      res.status(err.httpStatus).json({ error: err.message });
    } else if (err instanceof MissingReasonError || err instanceof BankDetailsError || err instanceof VehicleNumberError) {
      res.status(400).json({ error: err.message });
    } else if (err instanceof BankTriesError) {
      res.status(429).json({ error: err.message });
    } else if (err instanceof DecisionRefusedError) {
      res.status(409).json({ error: err.message });
    } else if (err instanceof TransitionError || err instanceof OwnerLinkError) {
      res.status(409).json({ error: err.message });
    } else if (err instanceof Error && err.message.startsWith("Unknown driver")) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof Error && "status" in err && typeof (err as { status?: unknown }).status === "number") {
      // Body-parser and static-file errors carry their own status: malformed JSON, too large, not found.
      const status = (err as { status: number }).status;
      const message = status === 413 ? "Request too large." : status === 404 ? "Not found." : "Invalid request.";
      res.status(status >= 400 && status < 500 ? status : 500).json({ error: message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Something went wrong." });
    }
  });

  return app;
}
