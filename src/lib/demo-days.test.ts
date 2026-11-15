import { describe, expect, it } from "vitest";

import { upcomingDays } from "./demo-days";

describe("upcomingDays", () => {
  it("starts two days after today in the business time zone", () => {
    // 2026-11-15 23:30 UTC is already Monday 16 November in Kyiv (UTC+2).
    const days = upcomingDays(new Date("2026-11-15T23:30:00Z"), "Europe/Kyiv");
    expect(days[0]).toEqual({ key: "2026-11-18", weekday: "Wed", date: 18 });
  });

  it("returns five consecutive days across a month boundary", () => {
    const days = upcomingDays(new Date("2026-11-28T10:00:00Z"), "Europe/Kyiv");
    expect(days.map((d) => d.key)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
  });

  it("uses the business zone, not the visitor's", () => {
    // 04:00 UTC on 15 Nov is still 14 Nov in New York.
    const ny = upcomingDays(new Date("2026-11-15T04:00:00Z"), "America/New_York");
    expect(ny[0].key).toBe("2026-11-16");
  });
});
