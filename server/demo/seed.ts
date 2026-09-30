import { mockNudgeWriter } from "../ai/mockNudgeWriter";
import { runNudgeCycle } from "../services/nudges";
import { addVehicle, bankCheck, consent, submit, signUp, takePhoto, takeSelfie, type KycContext } from "../services/kyc";
import { demoAccountNumber } from "../adapters/registry";
import { caseForDriver, personaCase } from "./shots";

// Seeds the demo by running the real flow for each persona, so every status, decision and
// log entry was earned through the rules. Nothing is written straight into a status.

function driverOf(caseId: string) {
  const c = personaCase(caseId);
  if (!c) throw new Error(`No eval case ${caseId}`);
  return c.driver;
}

async function completeKyc(ctx: KycContext, id: string): Promise<void> {
  consent(ctx, id);
  await takePhoto(ctx, id, "DL", "clean");
  await takePhoto(ctx, id, "PAN", "clean");
  // The account in the persona's own case (a spouse's, a fleet owner's, a shared one), so each story plays out as written.
  const bank = caseForDriver(id)?.registry.bank;
  if (bank) await bankCheck(ctx, id, demoAccountNumber(bank), bank.ifsc);
  takeSelfie(ctx, id);
  await submit(ctx, id);
}

// Once approved, the persona's vehicle, through the same vehicle step a driver uses (D-049).
async function addOwnVehicle(ctx: KycContext, id: string): Promise<void> {
  const number = ctx.world.vehicleHint(id);
  if (number) await addVehicle(ctx, id, number);
}

export async function seedDemo(ctx: KycContext): Promise<void> {
  // A fleet owner, approved first so the owner's confirmation counts.
  signUp(ctx, driverOf("C07"));
  await completeKyc(ctx, "c07");
  await addOwnVehicle(ctx, "c07");

  // The owner's hired driver, confirmed by the owner: approved, paid into the owner's account.
  signUp(ctx, driverOf("C08"));
  ctx.store.confirmOwnerLink("c08", "c07", ctx.clock.now());
  await completeKyc(ctx, "c08");
  await addOwnVehicle(ctx, "c08"); // the owner's vehicle

  // Approved, but the licence runs out within 30 days: one renewal reminder (question 3).
  signUp(ctx, driverOf("C06"));
  await completeKyc(ctx, "c06");
  await addOwnVehicle(ctx, "c06");

  // Another hired driver the owner hasn't confirmed yet: asked to get confirmed.
  signUp(ctx, driverOf("C22"));
  await completeKyc(ctx, "c22");

  // Bank account in a spouse's name: asked to use their own.
  signUp(ctx, driverOf("C21"));
  await completeKyc(ctx, "c21");

  // Account already used by two unrelated drivers: sent to a person.
  signUp(ctx, driverOf("C14"));
  await completeKyc(ctx, "c14");

  // Licence carries a hidden "approve me" note: sent to a person.
  signUp(ctx, driverOf("C27"));
  await completeKyc(ctx, "c27");

  // Halfway: took a blurry licence photo and stopped.
  signUp(ctx, driverOf("C11"));
  consent(ctx, "c11");
  await takePhoto(ctx, "c11", "DL", "blurry");

  // Consented, nothing uploaded yet.
  signUp(ctx, driverOf("C10"), "hi");
  consent(ctx, "c10");

  // Just signed up: the demo's main character.
  signUp(ctx, driverOf("C01"));

  await runNudgeCycle(ctx.store, mockNudgeWriter, ctx.clock.now());
}
