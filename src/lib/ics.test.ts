import { describe, expect, it } from "vitest";

import {
  buildBookingIcs,
  buildBookingIcsFilename,
  buildStaffCalendarIcs,
  buildStaffCalendarIcsFilename,
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

  it("builds a staff subscription calendar feed with multiple events and redacts erased clients", () => {
    const feed = buildStaffCalendarIcs({
      businessName: "Northside Barbers",
      businessTimezone: "Europe/Kyiv",
      staffName: "Andriy",
      now: new Date("2026-11-16T09:00:00Z"),
      events: [
        {
          bookingId: "bk-1",
          serviceName: "Haircut",
          startsAtIso: "2026-11-17T08:00:00Z",
          endsAtIso: "2026-11-17T08:30:00Z",
          status: "confirmed",
          customerName: "Olena Koval",
          notes: "Scissors only",
        },
        {
          bookingId: "bk-2",
          serviceName: "Beard trim",
          startsAtIso: "2026-11-17T10:00:00Z",
          endsAtIso: "2026-11-17T10:20:00Z",
          status: "completed",
          customerName: "Erased customer",
          notes: "Should never leak",
          erased: true,
        },
      ],
    });

    const unfolded = feed.replace(/\r\n /g, "");
    expect(feed.endsWith("\r\n")).toBe(true);
    expect(unfolded).toContain("X-WR-CALNAME:Andriy — Northside Barbers\r\n");
    expect(unfolded).toContain("X-WR-TIMEZONE:Europe/Kyiv\r\n");
    expect(unfolded).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n");
    expect(unfolded).toContain("SUMMARY:Haircut — Olena Koval\r\n");
    expect(unfolded).toContain("DESCRIPTION:Client: Olena Koval\\nStatus: confirmed\\nNotes: Scissors only\r\n");
    expect(unfolded).toContain("SUMMARY:Beard trim — Client\r\n");
    expect(unfolded).not.toContain("Erased customer");
    expect(unfolded).not.toContain("Should never leak");
    expect(unfolded).not.toContain("ATTENDEE");
  });

  it("builds a valid empty staff subscription feed when no bookings exist", () => {
    const emptyFeed = buildStaffCalendarIcs({
      businessName: "Northside Barbers",
      businessTimezone: "Europe/Kyiv",
      staffName: "Marta",
      now: new Date("2026-11-16T09:00:00Z"),
      events: [],
    });

    expect(emptyFeed).toContain("BEGIN:VCALENDAR\r\n");
    expect(emptyFeed).toContain("X-WR-CALNAME:Marta — Northside Barbers\r\n");
    expect(emptyFeed).not.toContain("BEGIN:VEVENT");
    expect(emptyFeed).toContain("END:VCALENDAR\r\n");
  });

  it("builds a clean staff calendar feed filename", () => {
    expect(buildStaffCalendarIcsFilename("northside-barbers", "Andriy Koval")).toBe(
      "tendly-northside-barbers-andriy-koval.ics",
    );
  });
});
