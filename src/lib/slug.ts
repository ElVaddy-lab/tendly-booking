import { z } from "zod";

export const RESERVED_SLUGS = [
  "admin",
  "api",
  "auth",
  "b",
  "dashboard",
  "demo",
  "login",
  "logout",
  "manage",
  "onboarding",
  "pricing",
  "settings",
  "sign-in",
  "sign-up",
  "stripe",
  "tendly",
  "webhooks",
] as const;

const RESERVED_SLUG_SET = new Set<string>(RESERVED_SLUGS);

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$/;

export function slugifyBusinessName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function isValidIanaTimeZone(tz: string): boolean {
  const trimmed = tz.trim();
  if (!trimmed) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export const businessStepSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your business name.")
    .max(80, "Business name must be 80 characters or fewer."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      SLUG_PATTERN,
      "Use 3–48 lowercase letters, numbers, or hyphens between words.",
    )
    .refine((value) => !RESERVED_SLUG_SET.has(value), "That URL slug is reserved."),
  timezone: z
    .string()
    .trim()
    .min(1, "Choose a time zone.")
    .refine(isValidIanaTimeZone, "Choose a valid IANA time zone."),
});

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

export function parsePriceToCents(raw: string | null | undefined): number | null | "invalid" {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return "invalid";
  }
  const [wholePart, decimalPart = ""] = trimmed.split(".");
  const dollars = Number(wholePart);
  const cents = Number(decimalPart.padEnd(2, "0"));
  const total = dollars * 100 + cents;
  if (!Number.isSafeInteger(total) || total < 0 || total > 10_000_000) {
    return "invalid";
  }
  return total;
}

export const serviceScheduleStepSchema = z
  .object({
    businessId: z.string().regex(UUID_PATTERN, "Invalid business."),
    staffName: z
      .string()
      .trim()
      .min(1, "Enter the staff member's display name.")
      .max(60, "Display name must be 60 characters or fewer."),
    serviceName: z
      .string()
      .trim()
      .min(1, "Enter your first service name.")
      .max(80, "Service name must be 80 characters or fewer."),
    durationMin: z.coerce
      .number()
      .int("Duration must be a whole number of minutes.")
      .min(5, "Duration must be at least 5 minutes.")
      .max(480, "Duration must be 480 minutes or less."),
    bufferMin: z.coerce
      .number()
      .int("Buffer must be a whole number of minutes.")
      .min(0, "Buffer cannot be negative.")
      .max(120, "Buffer must be 120 minutes or less."),
    priceCents: z.number().int().min(0).nullable(),
    weekdays: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(1, "Pick at least one working day."),
    startTime: z.string().regex(TIME_PATTERN, "Enter a valid start time (HH:MM)."),
    endTime: z.string().regex(TIME_PATTERN, "Enter a valid end time (HH:MM)."),
  })
  .refine((data) => toMinutes(data.endTime) > toMinutes(data.startTime), {
    message: "Closing time must be after opening time.",
    path: ["endTime"],
  });
