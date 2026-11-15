import { describe, expect, it } from "vitest";

import {
  RESERVED_SLUGS,
  businessStepSchema,
  parsePriceToCents,
  serviceScheduleStepSchema,
  slugifyBusinessName,
} from "./slug";

describe("slugifyBusinessName", () => {
  it("normalizes spaces, punctuation and casing", () => {
    expect(slugifyBusinessName("  Northside Barbers! ")).toBe("northside-barbers");
    expect(slugifyBusinessName("Cut & Shave Co. #1")).toBe("cut-shave-co-1");
    expect(slugifyBusinessName("---Trim---")).toBe("trim");
  });

  it("caps length at 48 characters without trailing hyphen", () => {
    const long = "a".repeat(47) + "-bb";
    expect(slugifyBusinessName(long)).toBe("a".repeat(47));
  });
});

describe("businessStepSchema", () => {
  it("accepts a valid business payload and trims/lowercases slug", () => {
    const parsed = businessStepSchema.safeParse({
      name: "  Northside Barbers ",
      slug: " Northside-Barbers ",
      timezone: "Europe/Kyiv",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        name: "Northside Barbers",
        slug: "northside-barbers",
        timezone: "Europe/Kyiv",
      });
    }
  });

  it.each(RESERVED_SLUGS)("rejects reserved slug %s", (slug) => {
    const parsed = businessStepSchema.safeParse({
      name: "Some Shop",
      slug,
      timezone: "Europe/Kyiv",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid slugs and invalid timezones", () => {
    expect(
      businessStepSchema.safeParse({ name: "Shop", slug: "ab", timezone: "Europe/Kyiv" }).success,
    ).toBe(false);
    expect(
      businessStepSchema.safeParse({ name: "Shop", slug: "-bad-", timezone: "Europe/Kyiv" }).success,
    ).toBe(false);
    expect(
      businessStepSchema.safeParse({ name: "Shop", slug: "valid-shop", timezone: "Mars/Olympus" })
        .success,
    ).toBe(false);
  });
});

describe("parsePriceToCents", () => {
  it("parses empty, integer and decimal prices", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("   ")).toBeNull();
    expect(parsePriceToCents("35")).toBe(3500);
    expect(parsePriceToCents("35.5")).toBe(3550);
    expect(parsePriceToCents("19.99")).toBe(1999);
    expect(parsePriceToCents("0")).toBe(0);
  });

  it("rejects malformed price strings", () => {
    expect(parsePriceToCents("-5")).toBe("invalid");
    expect(parsePriceToCents("12.345")).toBe("invalid");
    expect(parsePriceToCents("abc")).toBe("invalid");
  });
});

describe("serviceScheduleStepSchema", () => {
  const base = {
    businessId: "b0000000-0000-0000-0000-000000000001",
    staffName: "Andriy",
    serviceName: "Haircut",
    durationMin: 30,
    bufferMin: 10,
    priceCents: 3500,
    weekdays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
  };

  it("accepts valid service and weekly hours", () => {
    expect(serviceScheduleStepSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least one weekday and closing after opening", () => {
    expect(serviceScheduleStepSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(
      serviceScheduleStepSchema.safeParse({ ...base, startTime: "18:00", endTime: "09:00" })
        .success,
    ).toBe(false);
  });
});
