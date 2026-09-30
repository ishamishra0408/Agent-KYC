// Injectable time, so nudge timing can be tested (and demoed) by moving the clock.
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(t: Date): Clock {
  return { now: () => new Date(t) };
}

export class ManualClock implements Clock {
  private t: Date;

  constructor(start: Date) {
    this.t = new Date(start);
  }

  now(): Date {
    return new Date(this.t);
  }

  set(t: Date): void {
    this.t = new Date(t);
  }

  advanceHours(h: number): void {
    this.t = new Date(this.t.getTime() + h * 3_600_000);
  }

  advanceDays(d: number): void {
    this.advanceHours(d * 24);
  }
}
