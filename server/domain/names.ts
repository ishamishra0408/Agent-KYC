// Name matching for Indian names written in Latin script, where one person can appear as
// "Lakshmi" / "Laxmi", "Mohammed" / "Mohd", "S Ramesh" / "Ramesh S" or "Sathishkumar" / "Sathish Kumar".
// Two goals pull against each other: don't reject honest drivers over spelling (fairness),
// and don't match two people who only share a surname or a first name (fraud).

// Titles only. "Kumari" and "Devi" are real surnames, so they stay.
const HONORIFICS = new Set(["MR", "MRS", "MS", "SHRI", "SRI", "SMT", "DR"]);

const VARIANTS: Record<string, string> = {
  MOHD: "MOHAMMED",
  MD: "MOHAMMED",
  MOHAMMAD: "MOHAMMED",
  MUHAMMAD: "MOHAMMED",
  MUHAMMED: "MOHAMMED",
  MOHAMED: "MOHAMMED",
  MOHAMAD: "MOHAMMED",
  SHEIKH: "SHAIKH",
  SHEIK: "SHAIKH",
  SHAIK: "SHAIKH",
};

// Folds common transliteration differences so both spellings land on one key.
function fold(token: string): string {
  return token
    .replace(/KSH/g, "X") // Lakshmi -> Laxmi
    .replace(/PH/g, "F")
    .replace(/([BDGKT])H/g, "$1") // aspirates: Kavitha -> Kavita, Bharat -> Barat
    .replace(/EE/g, "I")
    .replace(/OO/g, "U")
    .replace(/OW/g, "OU") // Gowda -> Gouda
    .replace(/W/g, "V")
    .replace(/Y$/, "I") // Reddy -> Reddi
    .replace(/(.)\1+/g, "$1"); // doubled letters
}

export function nameTokens(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t))
    .map((t) => VARIANTS[t] ?? t)
    .map(fold);
}

export interface NameMatch {
  match: boolean;
  score: number; // share of the shorter name's tokens found in the longer one
}

export function namesMatch(a: string, b: string): NameMatch {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return { match: false, score: 0 };

  // "Sathishkumar" vs "Sathish Kumar": same letters, different spacing.
  if (ta.join("") === tb.join("")) return { match: true, score: 1 };

  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set<number>();
  const matchedShort = new Set<number>();
  let fullMatches = 0;

  // Pass 1: whole words. Done first so an initial can't steal a word's partner ("R RAMESH" vs "RAMESH R").
  short.forEach((tok, si) => {
    if (tok.length < 2) return;
    const idx = long.findIndex((l, i) => !used.has(i) && l === tok);
    if (idx >= 0) {
      used.add(idx);
      matchedShort.add(si);
      fullMatches++;
    }
  });

  // Pass 2: initials match any remaining word with that first letter ("S" ~ "SURESH").
  short.forEach((tok, si) => {
    if (matchedShort.has(si)) return;
    const idx = long.findIndex((l, i) => !used.has(i) && (l.length === 1 || tok.length === 1) && l[0] === tok[0]);
    if (idx >= 0) {
      used.add(idx);
      matchedShort.add(si);
    }
  });

  const score = matchedShort.size / short.length;

  if (short.length === 1 && long.length > 1) {
    // A one-word name only matches a name whose other parts are initials: "Kavitha" ~ "Kavitha M",
    // but not "Priya" ~ "Priya Sharma". Identity checks need more than a shared first name.
    const others = long.filter((_, i) => !used.has(i));
    return { match: fullMatches === 1 && others.every((t) => t.length === 1), score };
  }

  // Every token accounted for, with at least one whole word (not just initials) in common.
  return { match: score === 1 && fullMatches >= 1, score };
}
