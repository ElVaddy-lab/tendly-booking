import { io } from "next/cache";

import {
  computeSlotsFetchRange,
  formatPriceCents,
  type RawAvailableSlot,
} from "@/lib/booking-slots";
import { buildBookingIcs, buildBookingIcsFilename } from "@/lib/ics";
import { sanitizeManageToken } from "@/lib/manage-booking";
import { readClientRequestInfo } from "@/lib/request-info";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Database } from "@/types/database.generated";

export type ManageBookingStatus =
  Database["public"]["Enums"]["booking_status"];

export type ManageStaffOption = {
  id: string;
  display_name: string;
};

export type ManageBookingDetails = {
  bookingId: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessTimezone: string;
  businessIsDemo: boolean;
  cancellationDeadlineHours: number;
  bookingHorizonDays: number;
  slotStepMinutes: number;
  minNoticeMinutes: number;
  serviceId: string;
  serviceName: string;
  serviceDurationMin: number;
  serviceBufferMin: number;
  priceLabel: string | null;
  serviceIsActive: boolean;
  staffId: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  status: ManageBookingStatus;
  customerName: string;
  customerTimezone: string | null;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  deadlineAt: string;
  canCancel: boolean;
  canReschedule: boolean;
  tokenExpiresAt: string;
  eligibleStaff: ManageStaffOption[];
  managePath: string;
  icsContent: string;
  icsFilename: string;
};

export async function getBookingByManageToken(
  rawToken: string,
  origin: string,
): Promise<ManageBookingDetails | null> {
  const token = sanitizeManageToken(rawToken);
  if (!token) {
    return null;
  }

  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("get_booking_by_token", {
    p_token: token,
  });

  if (error || !data) {
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  const { data: linksData } = await supabase
    .from("staff_services")
    .select("staff_id")
    .eq("business_id", row.business_id)
    .eq("service_id", row.service_id);

  const staffIds = (linksData ?? []).map((item) => item.staff_id);
  const { data: staffRows } =
    staffIds.length > 0
      ? await supabase
          .from("staff")
          .select("id, display_name")
          .eq("business_id", row.business_id)
          .eq("is_active", true)
          .in("id", staffIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : { data: [] as ManageStaffOption[] };

  const managePath = `/manage/${token}`;
  const manageUrl = `${origin}${managePath}`;

  return {
    bookingId: row.booking_id,
    businessId: row.business_id,
    businessSlug: row.business_slug,
    businessName: row.business_name,
    businessTimezone: row.business_timezone,
    businessIsDemo: row.business_is_demo,
    cancellationDeadlineHours: row.cancellation_deadline_hours,
    bookingHorizonDays: row.booking_horizon_days,
    slotStepMinutes: row.slot_step_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    serviceId: row.service_id,
    serviceName: row.service_name,
    serviceDurationMin: row.service_duration_min,
    serviceBufferMin: row.service_buffer_min,
    priceLabel: formatPriceCents(row.service_price_cents, row.service_currency),
    serviceIsActive: row.service_is_active,
    staffId: row.staff_id,
    staffName: row.staff_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    customerName: row.customer_name,
    customerTimezone: row.customer_timezone,
    notes: row.notes,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    deadlineAt: row.deadline_at,
    canCancel: row.can_cancel,
    canReschedule: row.can_reschedule,
    tokenExpiresAt: row.token_expires_at,
    eligibleStaff: (staffRows ?? []) as ManageStaffOption[],
    managePath,
    icsContent: buildBookingIcs({
      bookingId: row.booking_id,
      businessName: row.business_name,
      businessSlug: row.business_slug,
      serviceName: row.service_name,
      staffName: row.staff_name,
      startsAtIso: row.starts_at,
      endsAtIso: row.ends_at,
      manageUrl,
      notes: row.notes,
    }),
    icsFilename: buildBookingIcsFilename(row.business_slug, row.starts_at),
  };
}

export async function fetchRescheduleSlotsWindow(input: {
  token: string;
  staffId: string | null;
  fromIso?: string;
}): Promise<{
  slots: RawAvailableSlot[];
  error: string | null;
  code: "deadline_passed" | "not_confirmed" | "not_found" | "unknown" | null;
}> {
  const token = sanitizeManageToken(input.token);
  if (!token) {
    return {
      slots: [],
      error: "This booking link is invalid or has expired.",
      code: "not_found",
    };
  }

  const supabase = createPublicSupabaseClient();
  const { startIso, endIso } = computeSlotsFetchRange(input.fromIso);

  const { data, error } = await supabase.rpc("available_slots_for_reschedule", {
    p_token: token,
    p_staff_id: input.staffId ?? undefined,
    p_from: startIso,
    p_to: endIso,
  });

  if (error) {
    if (error.message.includes("deadline_passed")) {
      return {
        slots: [],
        error: "Online rescheduling closed before the shop's deadline.",
        code: "deadline_passed",
      };
    }
    if (error.message.includes("booking_not_confirmed")) {
      return {
        slots: [],
        error: "Only active confirmed appointments can be rescheduled.",
        code: "not_confirmed",
      };
    }
    if (error.message.includes("booking_not_found")) {
      return {
        slots: [],
        error: "This booking link is invalid or has expired.",
        code: "not_found",
      };
    }
    return {
      slots: [],
      error: "Could not load open reschedule times right now.",
      code: "unknown",
    };
  }

  return {
    slots: (data ?? []) as RawAvailableSlot[],
    error: null,
    code: null,
  };
}

export async function getManageBookingPageData(rawToken: string): Promise<{
  booking: ManageBookingDetails | null;
  initialSlots: RawAvailableSlot[];
  initialSlotsError: string | null;
  generatedAtIso: string;
}> {
  await io();
  const { origin } = await readClientRequestInfo();
  const generatedAtIso = new Date().toISOString();

  const booking = await getBookingByManageToken(rawToken, origin);
  if (!booking || !booking.canReschedule) {
    return {
      booking,
      initialSlots: [],
      initialSlotsError: null,
      generatedAtIso,
    };
  }

  const slotsResult = await fetchRescheduleSlotsWindow({
    token: rawToken,
    staffId: null,
  });

  return {
    booking,
    initialSlots: slotsResult.slots,
    initialSlotsError: slotsResult.error,
    generatedAtIso,
  };
}
