import { describe, expect, it } from "vitest";

import {
  formatBookingDateTime,
  formatDeadlineLabel,
  getDisplayInitials,
  isSameBookingSlot,
  normalizeTimeZone,
  sanitizeManageToken,
} from "./manage-booking";

describe("manage-booking helpers", () => {
  it("normalizes legacy Kiev zone alias and falls back on invalid zones", () => {
    expect(normalizeTimeZone("Europe/Kiev", "UTC")).toBe("Europe/Kyiv");
    expect(normalizeTimeZone("America/New_York", "Europe/Kyiv")).toBe(
      "America/New_York",
    );
    expect(normalizeTimeZone("Invalid/Zone", "Europe/Kyiv")).toBe("Europe/Kyiv");
    expect(normalizeTimeZone("", "Europe/Kyiv")).toBe("Europe/Kyiv");
  });

  it("formats appointment timestamps in the requested timezone", () => {
    // 2027-03-28 08:30 UTC -> Europe/Kyiv transitioned to UTC+3 at 03:00 local (01:00 UTC) => 11:30
    const kyiv = formatBookingDateTime("2027-03-28T08:30:00.000Z", "Europe/Kyiv");
    expect(kyiv.timeLabel).toBe("11:30");
    expect(kyiv.dateLabel).toContain("Mar 28");

    // Same UTC instant in America/New_York (UTC-4 EDT) => 04:30 on Mar 28
    const ny = formatBookingDateTime(
      "2027-03-28T08:30:00.000Z",
      "America/New_York",
    );
    expect(ny.timeLabel).toBe("04:30");
    expect(ny.dateLabel).toContain("Mar 28");
  });

  it("handles invalid ISO strings gracefully in date formatters", () => {
    expect(formatBookingDateTime("not-a-date", "Europe/Kyiv")).toEqual({
      dateLabel: "Scheduled date",
      timeLabel: "",
    });
    expect(formatDeadlineLabel("not-a-date", "Europe/Kyiv")).toBe("deadline");
  });

  it("formats deadline labels clearly in target timezone", () => {
    const label = formatDeadlineLabel("2027-04-10T11:00:00+00:00", "Europe/Kyiv");
    expect(label).toContain("Apr 10");
    expect(label).toContain("14:00");
  });

  it("validates manage tokens cleanly while rejecting malformed or unsafe strings", () => {
    const validHex = "a".repeat(64);
    expect(sanitizeManageToken(`  ${validHex}  `)).toBe(validHex);
    expect(sanitizeManageToken("")).toBeNull();
    expect(sanitizeManageToken("short")).toBeNull();
    expect(sanitizeManageToken("../etc/passwd")).toBeNull();
    expect(sanitizeManageToken("bad token with spaces 12345")).toBeNull();
    expect(sanitizeManageToken("x".repeat(129))).toBeNull();
  });

  it("matches exact current (staffId, startsAt) slots regardless of ISO formatting", () => {
    expect(
      isSameBookingSlot({
        selectedStaffId: "staff-1",
        selectedStartsAtIso: "2027-04-10T09:00:00.000Z",
        currentStaffId: "staff-1",
        currentStartsAtIso: "2027-04-10T09:00:00+00:00",
      }),
    ).toBe(true);

    // Different staff at the same time is a valid cross-staff reschedule
    expect(
      isSameBookingSlot({
        selectedStaffId: "staff-2",
        selectedStartsAtIso: "2027-04-10T09:00:00.000Z",
        currentStaffId: "staff-1",
        currentStartsAtIso: "2027-04-10T09:00:00Z",
      }),
    ).toBe(false);

    // "Anyone available" (null) at same time could pick another barber -> not blocked as identical
    expect(
      isSameBookingSlot({
        selectedStaffId: null,
        selectedStartsAtIso: "2027-04-10T09:00:00.000Z",
        currentStaffId: "staff-1",
        currentStartsAtIso: "2027-04-10T09:00:00Z",
      }),
    ).toBe(false);
  });

  it("extracts avatar initials from single-word and multi-word names", () => {
    expect(getDisplayInitials("Andriy Koval")).toBe("AK");
    expect(getDisplayInitials("Marta")).toBe("MA");
    expect(getDisplayInitials("   ")).toBe("?");
  });
});
