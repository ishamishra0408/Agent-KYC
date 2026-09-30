// A second look for text aimed at the verification system (D-049). The reader flags hidden instructions
// itself (suspiciousText); this scan checks what it transcribed into the fields, so text the reader
// copied into a field without flagging it still sends the case to a person. It can't see text the reader
// left out altogether: that stays the reader's job, and the evals measure it. Pure code, used by the
// policy input.
const PATTERNS: readonly RegExp[] = [
  /\b(?:pre-?)?approv(?:e|ed|al)\b/i,
  /\b(?:pre-?)?verified\b/i,
  /\bmark(?:ed)?\b[\s\S]*\b(?:pass(?:ed)?|verified|approved|clear(?:ed)?)\b/i,
  /\b(?:ignore|disregard)\b[\s\S]*\b(?:instructions?|rules?|checks?)\b/i,
  /\bverification system\b/i,
];

export function instructionsIn(fields: unknown): string | null {
  if (typeof fields !== "object" || fields === null) return null;
  for (const value of Object.values(fields)) {
    if (typeof value === "string" && PATTERNS.some((p) => p.test(value))) return value;
  }
  return null;
}
