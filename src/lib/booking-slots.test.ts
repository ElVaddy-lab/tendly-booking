import { describe, expect, it } from "vitest";

import {
  buildBookingDateDays,
  formatPriceCents,
  groupAvailableSlotsByDate,
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

  it("formats prices cleanly without trailing .00 on whole dollar amounts", () => {
    expect(formatPriceCents(3500, "USD")).toBe("$35");
    expect(formatPriceCents(3550, "USD")).toBe("$35.50");
    expect(formatPriceCents(0, "USD")).toBe("Free");
    expect(formatPriceCents(null, "USD")).toBeNull();
  });
});
