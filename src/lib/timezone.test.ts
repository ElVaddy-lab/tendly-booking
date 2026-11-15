import { describe, expect, it } from "vitest";

import {
  formatTimeOffPeriod,
  localDateTimeToUtcIso,
  parsePostgresRange,
} from "./timezone";

describe("localDateTimeToUtcIso", () => {
  it("converts Kyiv winter and summer wall times accurately", () => {
    // 2027-01-15 in Europe/Kyiv is UTC+2
    expect(localDateTimeToUtcIso("2027-01-15T09:00", "Europe/Kyiv")).toBe(
      "2027-01-15T07:00:00.000Z",
    );
    // 2027-07-15 in Europe/Kyiv is UTC+3
    expect(localDateTimeToUtcIso("2027-07-15T09:00", "Europe/Kyiv")).toBe(
      "2027-07-15T06:00:00.000Z",
    );
  });

  it("handles DST switch day in Europe/Kyiv and America/New_York", () => {
    // Kyiv switches to UTC+3 at 03:00 -> 04:00 on 2027-03-28
    expect(localDateTimeToUtcIso("2027-03-28T09:00", "Europe/Kyiv")).toBe(
      "2027-03-28T06:00:00.000Z",
    );
    // New York switches to EDT (UTC-4) on 2027-03-14 at 02:00 -> 03:00
    expect(localDateTimeToUtcIso("2027-03-14T09:00", "America/New_York")).toBe(
      "2027-03-14T13:00:00.000Z",
    );
  });

  it("rejects nonexistent DST wall times, impossible dates and unknown zones", () => {
    expect(localDateTimeToUtcIso("2027-03-28T03:30", "Europe/Kyiv")).toBeNull();
    expect(localDateTimeToUtcIso("2027-02-30T10:00", "Europe/Kyiv")).toBeNull();
    expect(localDateTimeToUtcIso("2027-03-10T09:00", "Mars/Olympus")).toBeNull();
    expect(localDateTimeToUtcIso("not-a-date", "Europe/Kyiv")).toBeNull();
  });
});

describe("parsePostgresRange and formatTimeOffPeriod", () => {
  it("parses a Postgres tstzrange string and formats same-day vs multi-day in shop timezone", () => {
    const sameDay = '["2027-01-15 07:00:00+00","2027-01-15 11:30:00+00")';
    const parsed = parsePostgresRange(sameDay);
    expect(parsed?.start.toISOString()).toBe("2027-01-15T07:00:00.000Z");
    expect(parsed?.end.toISOString()).toBe("2027-01-15T11:30:00.000Z");
    expect(formatTimeOffPeriod(sameDay, "Europe/Kyiv")).toBe("Jan 15, 2027, 09:00–13:30");

    const multiDay = '["2027-07-01 06:00:00+00","2027-07-03 15:00:00+00")';
    expect(formatTimeOffPeriod(multiDay, "Europe/Kyiv")).toBe(
      "Jul 1, 2027, 09:00 – Jul 3, 2027, 18:00",
    );
  });
});
