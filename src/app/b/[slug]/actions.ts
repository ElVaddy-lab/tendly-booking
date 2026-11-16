"use server";

import { z } from "zod";

import { formatPriceCents, type RawAvailableSlot } from "@/lib/booking-slots";
import { buildBookingIcs, buildBookingIcsFilename } from "@/lib/ics";
import { checkBookingRateLimit } from "@/lib/rate-limit";
import { readClientRequestInfo } from "@/lib/request-info";
import { isValidIanaTimeZone, UUID_PATTERN } from "@/lib/slug";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { fetchAvailableSlotsWindow, getPublicBusinessCatalog } from "./data";

const uuidSchema = z.string().regex(UUID_PATTERN, "Invalid identifier.");

const listSlotsSchema = z.object({
  businessId: uuidSchema,
  serviceId: uuidSchema,
  staffId: uuidSchema.nullable(),
  fromIso: z.string().optional(),
});

const createBookingSchema = z.object({
  businessId: uuidSchema,
  slug: z.string().trim().min(1).max(64),
  serviceId: uuidSchema,
  staffId: uuidSchema.nullable(),
  startsAt: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Pick a valid time slot."),
  customerName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Name must be 80 characters or fewer."),
  customerEmail: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254, "Email must be 254 characters or fewer."),
  customerPhone: z
    .string()
    .trim()
    .max(32, "Phone number must be 32 characters or fewer.")
    .optional()
    .default(""),
  customerTimezone: z.string().trim().optional().default(""),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be 1000 characters or fewer.")
    .optional()
    .default(""),
  turnstileToken: z.string().trim(),
});

export type ConfirmedBookingSummary = {
  bookingId: string;
  staffId: string;
  staffName: string;
  serviceName: string;
  durationMin: number;
  priceLabel: string | null;
  startsAt: string;
  endsAt: string;
  manageToken: string;
  managePath: string;
  icsContent: string;
  icsFilename: string;
};

export type CreatePublicBookingResult = {
  error: string | null;
  code:
    | "validation"
    | "turnstile_failed"
    | "rate_limit"
    | "slot_unavailable"
    | "invalid_target"
    | "unknown"
    | null;
  fieldErrors?: Record<string, string>;
  booking: ConfirmedBookingSummary | null;
};

export async function listPublicSlotsAction(input: {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  fromIso?: string;
}): Promise<{ slots: RawAvailableSlot[]; error: string | null }> {
  const parsed = listSlotsSchema.safeParse(input);
  if (!parsed.success) {
    return { slots: [], error: "Invalid booking filter." };
  }

  return fetchAvailableSlotsWindow({
    businessId: parsed.data.businessId,
    serviceId: parsed.data.serviceId,
    staffId: parsed.data.staffId,
    fromIso: parsed.data.fromIso,
  });
}

export async function createPublicBookingAction(input: {
  businessId: string;
  slug: string;
  serviceId: string;
  staffId: string | null;
  startsAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerTimezone?: string;
  notes?: string;
  turnstileToken: string;
}): Promise<CreatePublicBookingResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      error: parsed.error.issues[0]?.message ?? "Check your booking details.",
      code: "validation",
      fieldErrors,
      booking: null,
    };
  }

  const { ip, origin } = await readClientRequestInfo();

  const turnstileOk = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
  if (!turnstileOk) {
    return {
      error: "Please complete the verification check and try again.",
      code: "turnstile_failed",
      booking: null,
    };
  }

  const rateLimit = checkBookingRateLimit({
    ip,
    email: parsed.data.customerEmail,
  });
  if (!rateLimit.allowed) {
    return {
      error: "Too many booking requests right now. Please wait a few minutes and try again.",
      code: "rate_limit",
      booking: null,
    };
  }

  const catalog = await getPublicBusinessCatalog(parsed.data.slug);
  if (!catalog || catalog.business.id !== parsed.data.businessId) {
    return {
      error: "This booking page is no longer available. Please refresh the page.",
      code: "invalid_target",
      booking: null,
    };
  }

  const service = catalog.services.find((s) => s.id === parsed.data.serviceId);
  if (!service) {
    return {
      error: "That service is no longer available. Please pick another service.",
      code: "invalid_target",
      booking: null,
    };
  }

  const validCustomerTz = isValidIanaTimeZone(parsed.data.customerTimezone)
    ? parsed.data.customerTimezone
    : null;

  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_business_id: parsed.data.businessId,
    p_service_id: parsed.data.serviceId,
    p_staff_id: (parsed.data.staffId ?? null) as unknown as string,
    p_starts_at: parsed.data.startsAt,
    p_customer_name: parsed.data.customerName,
    p_customer_email: parsed.data.customerEmail,
    p_customer_phone: parsed.data.customerPhone || undefined,
    p_customer_timezone: validCustomerTz ?? undefined,
    p_notes: parsed.data.notes || undefined,
  });

  if (error) {
    if (error.message.includes("rate_limit_exceeded")) {
      return {
        error: "Too many booking requests for this email. Please wait a few minutes and try again.",
        code: "rate_limit",
        booking: null,
      };
    }
    if (error.message.includes("slot_unavailable") || error.code === "P0001") {
      return {
        error: "That slot was just taken. Please pick another time.",
        code: "slot_unavailable",
        booking: null,
      };
    }
    if (error.code === "23514") {
      return {
        error: "Please check your contact details and notes, then try again.",
        code: "validation",
        booking: null,
      };
    }
    return {
      error: "Could not complete your booking right now. Please try again.",
      code: "unknown",
      booking: null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      error: "Could not complete your booking right now. Please try again.",
      code: "unknown",
      booking: null,
    };
  }

  const assignedStaff =
    catalog.staff.find((member) => member.id === row.staff_id) ?? null;
  const staffName = assignedStaff?.display_name ?? "Assigned specialist";
  const managePath = `/manage/${row.manage_token}`;
  const manageUrl = `${origin}${managePath}`;

  const icsContent = buildBookingIcs({
    bookingId: row.booking_id,
    businessName: catalog.business.name,
    businessSlug: catalog.business.slug,
    serviceName: service.name,
    staffName,
    startsAtIso: row.starts_at,
    endsAtIso: row.ends_at,
    manageUrl,
    notes: parsed.data.notes || null,
  });

  return {
    error: null,
    code: null,
    booking: {
      bookingId: row.booking_id,
      staffId: row.staff_id,
      staffName,
      serviceName: service.name,
      durationMin: service.duration_min,
      priceLabel: formatPriceCents(service.price_cents, service.currency),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      manageToken: row.manage_token,
      managePath,
      icsContent,
      icsFilename: buildBookingIcsFilename(catalog.business.slug, row.starts_at),
    },
  };
}
