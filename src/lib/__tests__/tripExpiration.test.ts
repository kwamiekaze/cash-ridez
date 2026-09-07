import { describe, it, expect } from "vitest";
import {
  isExpiredTrip,
  effectiveTripStatus,
  withoutExpiredTrips,
  tripExpiryCutoffISO,
  TRIP_EXPIRY_MS,
} from "@/lib/tripExpiration";

const NOW = new Date("2026-09-07T12:00:00.000Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString();

describe("isExpiredTrip", () => {
  it("expires an unfinished trip past 48 hours", () => {
    expect(isExpiredTrip({ status: "open", pickup_time: ago(49) }, NOW)).toBe(true);
    expect(isExpiredTrip({ status: "assigned", pickup_time: ago(72) }, NOW)).toBe(true);
  });

  it("keeps trips inside the window live", () => {
    expect(isExpiredTrip({ status: "open", pickup_time: ago(47.9) }, NOW)).toBe(false);
    expect(isExpiredTrip({ status: "open", pickup_time: ago(48) }, NOW)).toBe(false);
  });

  it("never re-classifies finished history", () => {
    expect(isExpiredTrip({ status: "completed", pickup_time: ago(500) }, NOW)).toBe(false);
    expect(isExpiredTrip({ status: "cancelled", pickup_time: ago(500) }, NOW)).toBe(false);
    expect(isExpiredTrip({ status: "expired", pickup_time: ago(500) }, NOW)).toBe(false);
  });

  it("handles missing or malformed input safely", () => {
    expect(isExpiredTrip(null, NOW)).toBe(false);
    expect(isExpiredTrip({ status: "open", pickup_time: null }, NOW)).toBe(false);
    expect(isExpiredTrip({ status: "open", pickup_time: "not a date" }, NOW)).toBe(false);
  });
});

describe("effectiveTripStatus", () => {
  it("folds an unapplied expiry into the displayed status", () => {
    expect(effectiveTripStatus({ status: "open", pickup_time: ago(60) }, NOW)).toBe("expired");
    expect(effectiveTripStatus({ status: "open", pickup_time: ago(1) }, NOW)).toBe("open");
    expect(effectiveTripStatus({ status: "completed", pickup_time: ago(600) }, NOW)).toBe("completed");
  });
});

describe("feed helpers", () => {
  it("drops stale unfinished trips only", () => {
    const trips = [
      { id: "a", status: "open", pickup_time: ago(1) },
      { id: "b", status: "open", pickup_time: ago(100) },
      { id: "c", status: "completed", pickup_time: ago(100) },
    ];
    expect(withoutExpiredTrips(trips, NOW).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("produces a cutoff exactly 48 hours back", () => {
    expect(new Date(tripExpiryCutoffISO(NOW)).getTime()).toBe(NOW.getTime() - TRIP_EXPIRY_MS);
    expect(TRIP_EXPIRY_MS).toBe(48 * 3600_000);
  });
});
