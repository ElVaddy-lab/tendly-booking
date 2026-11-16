"use server";

import { z } from "zod";

import type { RawAvailableSlot } from "@/lib/booking-slots";
import { isSameBookingSlot, sanitizeManageToken } from "@/lib/manage-booking";
import { checkManageRateLimit } from "@/lib/rate-limit";
import { readClientRequestInfo } from "@/lib/request-info";
import { UUID_PATTERN } from "@/lib/slug";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  fetchRescheduleSlotsWindow,
  getBookingByManageToken,
  type ManageBookingDetails,
} from "./data";

const uuidSchema = z.string().regex(UUID_PATTERN, "Invalid identifier.");

const listRescheduleSlotsSchema = z.object({
  token: z.string().trim().min(1),
  staffId: uuidSchema.nullable(),
  fromIso: z.string().optional(),
});

const cancelBookingSchema = z.object({
  token: z.string().trim().min(1),
  turnstileToken: z.string().trim(),
});

const rescheduleBookingSchema = z.object({
  token: z.string().trim().min(1),
  staffId: uuidSchema.nullable(),
  startsAt: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Pick a valid time slot."),
  turnstileToken: z.string().trim(),
});

export type ManageMutationCode =
  | "validation"
  | "turnstile_failed"
  | "rate_limit"
  | "slot_unavailable"
  | "deadline_passed"
  | "not_confirmed"
  | "not_found"
  | "unknown"
  | null;

export type ManageMutationResult = {
  error: string | null;
  code: ManageMutationCode;
  booking: ManageBookingDetails | null;
};

function mapRpcError(message: string): {
  code: ManageMutationCode;
  error: string;
} {
  if (message.includes("slot_unavailable")) {
    return {
      code: "slot_unavailable",
      error: "That slot was just taken. Please pick another time.",
    };
  }
  if (message.includes("deadline_passed")) {
    return {
      code: "deadline_passed",
      error: "Online changes closed before the shop's deadline.",
    };
  }
  if (message.includes("booking_not_confirmed")) {
    return {
      code: "not_confirmed",
      error: "This appointment is no longer active and cannot be changed.",
    };
  }
  if (message.includes("booking_not_found")) {
    return {
      code: "not_found",
      error: "This booking link is invalid or has expired.",
    };
  }
  return {
    code: "unknown",
    error: "Could not update your booking right now. Please try again.",
  };
}

export async function listRescheduleSlotsAction(input: {
  token: string;
  staffId: string | null;
  fromIso?: string;
}): Promise<{ slots: RawAvailableSlot[]; error: string | null }> {
  const parsed = listRescheduleSlotsSchema.safeParse(input);
  if (!parsed.success || !sanitizeManageToken(parsed.data.token)) {
    return { slots: [], error: "Booking link is invalid." };
  }

  const res = await fetchRescheduleSlotsWindow({
    token: parsed.data.token,
    staffId: parsed.data.staffId,
    fromIso: parsed.data.fromIso,
  });

  return { slots: res.slots, error: res.error };
}

export async function cancelBookingAction(input: {
  token: string;
  turnstileToken: string;
}): Promise<ManageMutationResult> {
  const parsed = cancelBookingSchema.safeParse(input);
  const cleanToken = parsed.success ? sanitizeManageToken(parsed.data.token) : null;
  if (!parsed.success || !cleanToken) {
    return {
      error: "This booking link is invalid or has expired.",
      code: "not_found",
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

  const rateLimit = checkManageRateLimit({ ip, token: cleanToken });
  if (!rateLimit.allowed) {
    return {
      error: "Too many booking update requests right now. Please wait a few minutes.",
      code: "rate_limit",
      booking: null,
    };
  }

  const supabase = createPublicSupabaseClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_token: cleanToken,
  });

  const latestBooking = await getBookingByManageToken(cleanToken, origin);

  if (error) {
    const mapped = mapRpcError(error.message);
    return {
      error: mapped.error,
      code: mapped.code,
      booking: latestBooking,
    };
  }

  return {
    error: null,
    code: null,
    booking: latestBooking,
  };
}

export async function rescheduleBookingAction(input: {
  token: string;
  staffId: string | null;
  startsAt: string;
  turnstileToken: string;
}): Promise<ManageMutationResult> {
  const parsed = rescheduleBookingSchema.safeParse(input);
  const cleanToken = parsed.success ? sanitizeManageToken(parsed.data.token) : null;
  if (!parsed.success || !cleanToken) {
    return {
      error:
        (!parsed.success && parsed.error.issues[0]?.message) ||
        "This booking link is invalid or has expired.",
      code: !parsed.success ? "validation" : "not_found",
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

  const rateLimit = checkManageRateLimit({ ip, token: cleanToken });
  if (!rateLimit.allowed) {
    return {
      error: "Too many booking update requests right now. Please wait a few minutes.",
      code: "rate_limit",
      booking: null,
    };
  }

  const currentBooking = await getBookingByManageToken(cleanToken, origin);
  if (!currentBooking) {
    return {
      error: "This booking link is invalid or has expired.",
      code: "not_found",
      booking: null,
    };
  }

  if (
    isSameBookingSlot({
      selectedStaffId: parsed.data.staffId,
      selectedStartsAtIso: parsed.data.startsAt,
      currentStaffId: currentBooking.staffId,
      currentStartsAtIso: currentBooking.startsAt,
    })
  ) {
    return {
      error: "Choose a different time or specialist to reschedule.",
      code: "validation",
      booking: currentBooking,
    };
  }

  const supabase = createPublicSupabaseClient();
  const { error } = await supabase.rpc("reschedule_booking", {
    p_token: cleanToken,
    p_staff_id: (parsed.data.staffId ?? null) as unknown as string,
    p_starts_at: parsed.data.startsAt,
  });

  const latestBooking = await getBookingByManageToken(cleanToken, origin);

  if (error) {
    const mapped = mapRpcError(error.message);
    return {
      error: mapped.error,
      code: mapped.code,
      booking: latestBooking ?? currentBooking,
    };
  }

  return {
    error: null,
    code: null,
    booking: latestBooking,
  };
}
