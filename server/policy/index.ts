import { makeRules } from "../domain/rules";
import { loadOpaEngine } from "./opa";

// The app's one rules engine: the OPA policy, wrapped in the domain's contract (D-030).
// This is the only module that creates one (tests/boundaries.test.ts checks).
export const rules = makeRules(loadOpaEngine());

export const decide = rules.decide;
export const photoIssue = rules.photoIssue;
export const POLICY_VERSION = rules.version;
