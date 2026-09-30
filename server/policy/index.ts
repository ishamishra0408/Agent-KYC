import { makeRules } from "../domain/rules";
import { makeVehicleRules } from "../domain/vehicle";
import { loadOpaEngine } from "./opa";

// The app's one rules engine: the OPA policy, wrapped in the domain's contracts (D-030), one for the
// driver's KYC and one for their vehicle (D-049). This is the only module that creates them
// (tests/boundaries.test.ts checks).
const engine = loadOpaEngine();
export const rules = makeRules(engine);
export const vehicleRules = makeVehicleRules(engine);

export const decide = rules.decide;
export const photoIssue = rules.photoIssue;
export const POLICY_VERSION = rules.version;
