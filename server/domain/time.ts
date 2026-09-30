// India has one time zone and no daylight saving, so a fixed offset is exact.
const IST_OFFSET_MS = 330 * 60 * 1000;

export interface IstParts {
  y: number;
  m: number; // 0-based month
  day: number;
  hour: number;
  minute: number;
}

export function istParts(d: Date): IstParts {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    day: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  };
}

// YYYY-MM-DD in IST.
export function istDate(d: Date): string {
  const p = istParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// A moment given in IST wall-clock time. Day overflow rolls into the next month.
export function istAt(y: number, m: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(y, m, day, hour, minute) - IST_OFFSET_MS);
}

// Whole days from one YYYY-MM-DD date to another (negative if `to` is earlier). Null if either isn't a date.
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86_400_000);
}
