import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  computeCalendarRangeHours,
  computeDayBlockPlacement,
  formatDateKeyInZone,
  formatZonedShortDate,
  formatZonedTime,
  getIsoWeekdayFromDateKey,
  getMinutesSinceMidnightInZone,
  getWeekDateKeys,
  isSyntheticPlaceholderEmail,
  layoutDayCalendarBlocks,
} from "./dashboard-bookings";

describe("dashboard-bookings calendar helpers", () => {
  it("computes local date keys and minutes accurately across time zones and DST", () => {
    // 2027-03-28 is Kyiv spring-forward: 02:00 UTC = 04:00? Wait: switch happens at 03:00 EET (01:00 UTC) -> 04:00 EEST
    // At 06:30 UTC in UTC+3 EEST -> 09:30 local
    const utcIso = "2027-03-28T06:30:00.000Z";
    expect(formatDateKeyInZone(utcIso, "Europe/Kyiv")).toBe("2027-03-28");
    expect(formatZonedTime(utcIso, "Europe/Kyiv")).toBe("09:30");
    expect(getMinutesSinceMidnightInZone(utcIso, "Europe/Kyiv")).toBe(9 * 60 + 30);

    // Same instant in America/New_York (EDT UTC-4) -> 02:30 local
    expect(formatZonedTime(utcIso, "America/New_York")).toBe("02:30");
    expect(getMinutesSinceMidnightInZone(utcIso, "America/New_York")).toBe(2 * 60 + 30);
  });

  it("navigates Gregorian date keys without timezone drift", () => {
    expect(addDaysToDateKey("2026-11-16", 7)).toBe("2026-11-23");
    expect(addDaysToDateKey("2026-11-16", -2)).toBe("2026-11-14");
    expect(addDaysToDateKey("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("builds a Monday-Sunday week anchored around any selected date key", () => {
    // 2026-11-19 is a Thursday -> Mon Nov 16 .. Sun Nov 22
    expect(getWeekDateKeys("2026-11-19")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);

    // Sunday wraps back to Monday Nov 16 .. Sunday Nov 22
    expect(getWeekDateKeys("2026-11-22")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });

  it("computes calendar visible hour range and percentage vertical block placement", () => {
    const range = computeCalendarRangeHours({
      bookings: [
        { startsAt: "2026-11-16T05:30:00.000Z", endsAt: "2026-11-16T06:00:00.000Z" }, // 07:30-08:00 Kyiv
      ],
      weeklyHours: [{ start_time: "09:00:00", end_time: "21:00:00" }],
      timeZone: "Europe/Kyiv",
    });

    expect(range).toEqual({ startHour: 7, endHour: 21 });

    // 10:00-11:00 inside 08:00-20:00 (12 hours = 720 min) -> top 16.67%, height 8.33%
    const pos = computeDayBlockPlacement({
      startsAtIso: "2026-11-16T08:00:00.000Z", // 10:00 Kyiv (UTC+2)
      endsAtIso: "2026-11-16T09:00:00.000Z", // 11:00 Kyiv
      startHour: 8,
      endHour: 20,
      timeZone: "Europe/Kyiv",
    });
    expect(pos.topPercent).toBeCloseTo((120 / 720) * 100, 2);
    expect(pos.heightPercent).toBeCloseTo((60 / 720) * 100, 2);
  });

  it("formats short calendar day headers and identifies synthetic placeholder emails", () => {
    expect(formatZonedShortDate("2026-11-16")).toBe("Mon, Nov 16");
    expect(
      isSyntheticPlaceholderEmail("walkin+0123456789abcdef0123456789abcdef@walkin.invalid"),
    ).toBe(true);
    expect(
      isSyntheticPlaceholderEmail("erased+b1000000-0000-0000-0000-000000000001@redacted.invalid"),
    ).toBe(true);
    expect(isSyntheticPlaceholderEmail("alex@example.com")).toBe(false);
  });

  it("computes ISO weekdays and assigns side-by-side lanes when bookings overlap at the same hour", () => {
    expect(getIsoWeekdayFromDateKey("2026-11-16")).toBe(1); // Monday
    expect(getIsoWeekdayFromDateKey("2026-11-22")).toBe(7); // Sunday

    const placed = layoutDayCalendarBlocks([
      { id: "cancelled-10", startsAt: "2026-11-16T08:00:00.000Z", endsAt: "2026-11-16T08:30:00.000Z" },
      { id: "confirmed-10", startsAt: "2026-11-16T08:00:00.000Z", endsAt: "2026-11-16T08:45:00.000Z" },
      { id: "confirmed-12", startsAt: "2026-11-16T10:00:00.000Z", endsAt: "2026-11-16T10:30:00.000Z" },
    ]);

    const first = placed.find((p) => p.id === "cancelled-10");
    const second = placed.find((p) => p.id === "confirmed-10");
    const isolated = placed.find((p) => p.id === "confirmed-12");

    expect(first?.laneCount).toBe(2);
    expect(second?.laneCount).toBe(2);
    expect(first?.lane).not.toBe(second?.lane);
    expect(isolated?.lane).toBe(0);
    expect(isolated?.laneCount).toBe(1);
  });
});
