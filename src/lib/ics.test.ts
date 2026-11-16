import { describe, expect, it } from "vitest";

import {
  buildBookingIcs,
  buildBookingIcsFilename,
  escapeIcsText,
  formatUtcIcsTimestamp,
} from "./ics";

describe("ics helpers", () => {
  it("formats timestamps strictly in UTC YYYYMMDDTHHMMSSZ", () => {
    expect(formatUtcIcsTimestamp("2026-11-17T10:30:00+02:00")).toBe("20261117T083000Z");
    expect(formatUtcIcsTimestamp(new Date("2026-11-17T10:30:00Z"))).toBe("20261117T103000Z");
  });

  it("escapes RFC 5545 delimiters and newlines", () => {
    expect(escapeIcsText("Hair, Beard; Trim\\Cut\nSecond line")).toBe(
      "Hair\\, Beard\\; Trim\\\\Cut\\nSecond line",
    );
  });

  it("builds a valid CRLF VCALENDAR with UID, SUMMARY, DESCRIPTION, and manage URL", () => {
    const ics = buildBookingIcs({
      bookingId: "bk-123",
      businessName: "Northside Barbers, Kyiv",
      businessSlug: "northside-barbers",
      serviceName: "Haircut",
      staffName: "Andriy",
      startsAtIso: "2026-11-17T08:30:00Z",
      endsAtIso: "2026-11-17T09:00:00Z",
      manageUrl: "https://tendly.app/manage/secret123",
      notes: "Low fade",
      now: new Date("2026-11-15T12:00:00Z"),
    });

    const unfolded = ics.replace(/\r\n /g, "");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(unfolded).toContain("BEGIN:VCALENDAR\r\n");
    expect(unfolded).toContain("VERSION:2.0\r\n");
    expect(unfolded).toContain("UID:bk-123@tendly.app\r\n");
    expect(unfolded).toContain("DTSTAMP:20261115T120000Z\r\n");
    expect(unfolded).toContain("DTSTART:20261117T083000Z\r\n");
    expect(unfolded).toContain("DTEND:20261117T090000Z\r\n");
    expect(unfolded).toContain("SUMMARY:Haircut — Northside Barbers\\, Kyiv\r\n");
    expect(unfolded).toContain(
      "DESCRIPTION:Barber: Andriy\\nManage or cancel: https://tendly.app/manage/secret123\\nNotes: Low fade\r\n",
    );
    expect(unfolded).toContain("STATUS:CONFIRMED\r\n");
    expect(unfolded).toContain("END:VCALENDAR\r\n");
  });

  it("builds a clean filename", () => {
    expect(buildBookingIcsFilename("northside-barbers", "2026-11-17T08:30:00Z")).toBe(
      "tendly-northside-barbers-20261117-0830.ics",
    );
  });
});
