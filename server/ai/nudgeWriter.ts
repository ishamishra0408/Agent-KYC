import type { Blocker } from "../domain/nudgeRules";
import type { Language, ReasonCode } from "../domain/types";

export interface NudgeDraftInput {
  name: string;
  language: Language;
  blocker: Blocker;
  fixReason?: ReasonCode;
  renewBy?: string; // YYYY-MM-DD: the licence's last valid day, for a renewal or lapsed-licence reminder
}

// Drafts a message. Templates today, the AI nudge writer in Phase 3.
// A writer never sends anything: the send gateway decides.
export interface NudgeWriter {
  readonly name: string;
  draft(input: NudgeDraftInput): Promise<string>;
}
