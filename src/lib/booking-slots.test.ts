import { describe, expect, it } from "vitest";

import {
  buildBookingDateDays,
  computeSlotsFetchRange,
  formatPriceCents,
  groupAvailableSlotsByDate,
  MAX_SLOTS_RPC_WINDOW_MS,
} from "./booking-slots";

describe("booking-slots helpers", () => {
  it("builds consecutive date options anchored in the display timezone", () => {
    const days = buildBookingDateDays(
      new Date("2026-11-16T22:30:00Z"), // 2026-11-17 00:30 in Europe/Kyiv
      3,
      "Europe/Kyiv",
    );

    expect(days.map((d) => d.dateKey)).toEqual([
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
    expect(days[0].shortLabel).toBe("Tue 17");
    expect(days[0].fullLabel).toBe("Tue, Nov 17");
  });

  it("deduplicates timestamps for 'Anyone available' and renders both customer and shop clock times", () => {
    const grouped = groupAvailableSlotsByDate(
      [
        { staff_id: "staff-a", starts_at: "2026-11-17T08:30:00+00:00" },
        { staff_id: "staff-b", starts_at: "2026-11-17T08:30:00Z" },
        { staff_id: "staff-a", starts_at: "2026-11-17T09:00:00Z" },
      ],
      "America/New_York", // UTC-5 in mid-Nov (08:30 UTC -> 03:30 EST)
      "Europe/Kyiv", // UTC+2 in mid-Nov (08:30 UTC -> 10:30 EET)
    );

    const daySlots = grouped["2026-11-17"];
    expect(daySlots).toHaveLength(2);
    expect(daySlots[0].staffIds).toEqual(["staff-a", "staff-b"]);
    expect(daySlots[0].displayTime).toBe("03:30");
    expect(daySlots[0].shopTime).toBe("10:30");
    expect(daySlots[1].displayTime).toBe("04:00");
  });

  it("preserves exact wall times across Europe/Kyiv and America/New_York DST switch boundaries", () => {
    // On 2027-03-14 America/New_York springs forward at 02:00 EST -> EDT (07:00 UTC)
    // Europe/Kyiv is still on EET (UTC+2) until 2027-03-28
    const usSpringGrouped = groupAvailableSlotsByDate(
      [
        { staff_id: "staff-a", starts_at: "2027-03-14T06:30:00Z" }, // 01:30 EST / 08:30 EET
        { staff_id: "staff-a", starts_at: "2027-03-14T07:30:00Z" }, // 03:30 EDT / 09:30 EET
      ],
      "America/New_York",
      "Europe/Kyiv",
    );
    expect(usSpringGrouped["2027-03-14"].map((s) => `${s.displayTime}/${s.shopTime}`)).toEqual([
      "01:30/08:30",
      "03:30/09:30",
    ]);

    // On 2027-03-28 Europe/Kyiv springs forward at 03:00 EET -> 04:00 EEST (01:00 UTC)
    const kyivSpringGrouped = groupAvailableSlotsByDate(
      [
        { staff_id: "staff-a", starts_at: "2027-03-28T00:30:00Z" }, // 02:30 EET / 20:30 EDT (Mar 27)
        { staff_id: "staff-a", starts_at: "2027-03-28T01:00:00Z" }, // 04:00 EEST / 21:00 EDT (Mar 27)
      ],
      "Europe/Kyiv",
      "America/New_York",
    );
    expect(kyivSpringGrouped["2027-03-28"].map((s) => `${s.displayTime}/${s.shopTime}`)).toEqual([
      "02:30/20:30",
      "04:00/21:00",
    ]);
  });

  it("formats prices cleanly without trailing .00 on whole dollar amounts", () => {
    expect(formatPriceCents(3500, "USD")).toBe("$35");
    expect(formatPriceCents(3550, "USD")).toBe("$35.50");
    expect(formatPriceCents(0, "USD")).toBe("Free");
    expect(formatPriceCents(null, "USD")).toBeNull();
  });

  it("bounds slot RPC windows cleanly from either now or a future start", () => {
    const baseMs = Date.parse("2026-11-17T08:00:00.000Z");
    const fromNow = computeSlotsFetchRange(undefined, baseMs);
    expect(fromNow.startIso).toBe("2026-11-17T08:00:00.000Z");
    expect(Date.parse(fromNow.endIso) - Date.parse(fromNow.startIso)).toBe(
      MAX_SLOTS_RPC_WINDOW_MS,
    );

    const pastIgnored = computeSlotsFetchRange("2026-11-16T08:00:00.000Z", baseMs);
    expect(pastIgnored.startIso).toBe("2026-11-17T08:00:00.000Z");

    const futureKept = computeSlotsFetchRange("2026-11-24T08:00:00.000Z", baseMs);
    expect(futureKept.startIso).toBe("2026-11-24T08:00:00.000Z");
  });
});
