import type { Status } from "./types";

// The bookings lock. The API refuses bookings (403) unless this returns true.
export function canBook(status: Status): boolean {
  return status === "APPROVED" || status === "ACTIVE";
}
