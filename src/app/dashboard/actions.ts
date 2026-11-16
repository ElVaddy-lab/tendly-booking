"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { parsePriceToCents, TIME_PATTERN, UUID_PATTERN } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { localDateTimeToUtcIso } from "@/lib/timezone";
import type { Enums } from "@/types/database.generated";

export type DashboardActionState = {
  error: string | null;
  success?: string | null;
  fieldErrors?: Record<string, string>;
  invitePath?: string | null;
  managePath?: string | null;
  createdDateKey?: string | null;
};

const ROLE_RANK: Record<Enums<"member_role">, number> = {
  staff: 1,
  manager: 2,
  owner: 3,
};

const uuidField = z.string().regex(UUID_PATTERN, "Invalid identifier.");

const createServiceSchema = z.object({
  businessId: uuidField,
  name: z
    .string()
    .trim()
    .min(1, "Enter a service name.")
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
  staffIds: z.array(uuidField),
});

const toggleServiceSchema = z.object({
  businessId: uuidField,
  serviceId: uuidField,
  nextActive: z.enum(["true", "false"]),
});

const deleteServiceSchema = z.object({
  businessId: uuidField,
  serviceId: uuidField,
});

const updateServiceStaffSchema = z.object({
  businessId: uuidField,
  serviceId: uuidField,
  staffIds: z.array(uuidField),
});

const createStaffSchema = z.object({
  businessId: uuidField,
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(60, "Display name must be 60 characters or fewer."),
  serviceIds: z.array(uuidField),
});

const toggleStaffSchema = z.object({
  businessId: uuidField,
  staffId: uuidField,
  nextActive: z.enum(["true", "false"]),
});

const scheduleEntrySchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    start_time: z.string().regex(TIME_PATTERN, "Use HH:MM 24-hour times."),
    end_time: z.string().regex(TIME_PATTERN, "Use HH:MM 24-hour times."),
  })
  .refine((row) => toMinutes(row.end_time) > toMinutes(row.start_time), {
    message: "End time must be after start time.",
  });

const updateScheduleSchema = z.object({
  businessId: uuidField,
  staffId: uuidField,
  hours: z.array(scheduleEntrySchema),
});

const createTimeOffSchema = z.object({
  businessId: uuidField,
  staffId: uuidField,
  startLocal: z.string().trim().min(1, "Choose a start date and time."),
  endLocal: z.string().trim().min(1, "Choose an end date and time."),
  reason: z
    .string()
    .trim()
    .max(200, "Reason must be 200 characters or fewer.")
    .optional(),
});

const deleteTimeOffSchema = z.object({
  businessId: uuidField,
  timeOffId: uuidField,
});

const createInviteSchema = z.object({
  businessId: uuidField,
  role: z.enum(["staff", "manager"]),
  staffId: z
    .union([uuidField, z.literal("")])
    .optional()
    .transform((val) => (val ? val : undefined)),
});

const revokeInviteSchema = z.object({
  businessId: uuidField,
  invitationId: uuidField,
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const createManualBookingSchema = z.object({
  businessId: uuidField,
  serviceId: uuidField,
  staffId: uuidField,
  dateLocal: z.string().trim().regex(DATE_PATTERN, "Choose a booking date."),
  timeLocal: z.string().trim().regex(TIME_PATTERN, "Choose a start time."),
  customerName: z
    .string()
    .trim()
    .min(1, "Enter the client's name.")
    .max(80, "Client name must be 80 characters or fewer."),
  customerEmail: z
    .string()
    .trim()
    .max(254, "Email must be 254 characters or fewer.")
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      "Enter a valid email address or leave it blank.",
    ),
  customerPhone: z
    .string()
    .trim()
    .max(32, "Phone number must be 32 characters or fewer.")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be 1000 characters or fewer.")
    .optional(),
});

const updateBookingStatusSchema = z.object({
  businessId: uuidField,
  bookingId: uuidField,
  status: z.enum(["confirmed", "completed", "no_show", "cancelled"]),
});

const eraseBookingCustomerSchema = z.object({
  businessId: uuidField,
  bookingId: uuidField,
});

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function firstValidationError(error: z.ZodError): DashboardActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return {
    error: error.issues[0]?.message ?? "Check your form fields and try again.",
    fieldErrors,
  };
}

function findScheduleOverlap(
  hours: Array<{ weekday: number; start_time: string; end_time: string }>,
): boolean {
  const byDay = new Map<number, Array<{ start: number; end: number }>>();
  for (const row of hours) {
    const list = byDay.get(row.weekday) ?? [];
    list.push({ start: toMinutes(row.start_time), end: toMinutes(row.end_time) });
    byDay.set(row.weekday, list);
  }
  for (const ranges of byDay.values()) {
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i += 1) {
      if (ranges[i].start < ranges[i - 1].end) {
        return true;
      }
    }
  }
  return false;
}

async function requireActor(businessId: string, minRole: Enums<"member_role">) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/sign-in");
  }

  const { data: member } = await supabase
    .from("business_members")
    .select("role, businesses(id, timezone, is_demo)")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member || !member.businesses) {
    return { ok: false as const, error: "Business workspace not found." };
  }

  if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
    return { ok: false as const, error: "You do not have permission for this action." };
  }

  return {
    ok: true as const,
    supabase,
    userId,
    role: member.role,
    timezone: member.businesses.timezone,
  };
}

function refreshBusiness(businessId: string) {
  updateTag(`business:${businessId}`);
  revalidatePath("/dashboard");
}

export async function createServiceAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const priceCents = parsePriceToCents(String(formData.get("priceDollars") ?? ""));
  if (priceCents === "invalid") {
    return {
      error: "Enter a valid price (for example 35 or 35.00), or leave it blank.",
      fieldErrors: { priceDollars: "Enter a valid price." },
    };
  }

  const parsed = createServiceSchema.safeParse({
    businessId: formData.get("businessId"),
    name: formData.get("name"),
    durationMin: formData.get("durationMin"),
    bufferMin: formData.get("bufferMin") || "0",
    priceCents,
    staffIds: formData.getAll("staffIds"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { data: created, error } = await actor.supabase
    .from("services")
    .insert({
      business_id: parsed.data.businessId,
      name: parsed.data.name,
      duration_min: parsed.data.durationMin,
      buffer_min: parsed.data.bufferMin,
      price_cents: parsed.data.priceCents,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not add service. Please check your entries." };
  }

  const uniqueStaffIds = Array.from(new Set(parsed.data.staffIds));
  if (uniqueStaffIds.length > 0) {
    const { error: linkError } = await actor.supabase.from("staff_services").insert(
      uniqueStaffIds.map((staffId) => ({
        business_id: parsed.data.businessId,
        service_id: created.id,
        staff_id: staffId,
      })),
    );
    if (linkError) {
      await actor.supabase
        .from("services")
        .delete()
        .eq("id", created.id)
        .eq("business_id", parsed.data.businessId);
      return { error: "Could not assign selected staff to the service." };
    }
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: `Added "${parsed.data.name}".` };
}

export async function toggleServiceActiveAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = toggleServiceSchema.safeParse({
    businessId: formData.get("businessId"),
    serviceId: formData.get("serviceId"),
    nextActive: formData.get("nextActive"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const isActive = parsed.data.nextActive === "true";
  const { error } = await actor.supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", parsed.data.serviceId)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { error: "Could not update service status." };
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: isActive ? "Service activated." : "Service paused." };
}

export async function deleteServiceAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = deleteServiceSchema.safeParse({
    businessId: formData.get("businessId"),
    serviceId: formData.get("serviceId"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error } = await actor.supabase
    .from("services")
    .delete()
    .eq("id", parsed.data.serviceId)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "This service already has bookings and cannot be deleted. Pause it instead.",
      };
    }
    return { error: "Could not delete service." };
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: "Service removed." };
}

export async function updateServiceStaffAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = updateServiceStaffSchema.safeParse({
    businessId: formData.get("businessId"),
    serviceId: formData.get("serviceId"),
    staffIds: formData.getAll("staffIds"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error: deleteError } = await actor.supabase
    .from("staff_services")
    .delete()
    .eq("business_id", parsed.data.businessId)
    .eq("service_id", parsed.data.serviceId);

  if (deleteError) {
    return { error: "Could not update staff assignments." };
  }

  const uniqueStaffIds = Array.from(new Set(parsed.data.staffIds));
  if (uniqueStaffIds.length > 0) {
    const { error: insertError } = await actor.supabase.from("staff_services").insert(
      uniqueStaffIds.map((staffId) => ({
        business_id: parsed.data.businessId,
        service_id: parsed.data.serviceId,
        staff_id: staffId,
      })),
    );
    if (insertError) {
      return { error: "Could not save selected staff assignments." };
    }
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: "Staff assignments saved." };
}

export async function createStaffAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = createStaffSchema.safeParse({
    businessId: formData.get("businessId"),
    displayName: formData.get("displayName"),
    serviceIds: formData.getAll("serviceIds"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { data: created, error } = await actor.supabase
    .from("staff")
    .insert({
      business_id: parsed.data.businessId,
      display_name: parsed.data.displayName,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not add staff member." };
  }

  const uniqueServiceIds = Array.from(new Set(parsed.data.serviceIds));
  if (uniqueServiceIds.length > 0) {
    const { error: linkError } = await actor.supabase.from("staff_services").insert(
      uniqueServiceIds.map((serviceId) => ({
        business_id: parsed.data.businessId,
        staff_id: created.id,
        service_id: serviceId,
      })),
    );
    if (linkError) {
      await actor.supabase
        .from("staff")
        .delete()
        .eq("id", created.id)
        .eq("business_id", parsed.data.businessId);
      return { error: "Could not assign services to the new staff member." };
    }
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: `Added ${parsed.data.displayName}.` };
}

export async function toggleStaffActiveAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = toggleStaffSchema.safeParse({
    businessId: formData.get("businessId"),
    staffId: formData.get("staffId"),
    nextActive: formData.get("nextActive"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const isActive = parsed.data.nextActive === "true";
  const { error } = await actor.supabase
    .from("staff")
    .update({ is_active: isActive })
    .eq("id", parsed.data.staffId)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { error: "Could not update staff availability." };
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: isActive ? "Staff marked active." : "Staff marked inactive." };
}

export async function updateStaffScheduleAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const rawHoursJson = formData.get("hoursJson");
  let decodedHours: unknown = [];

  if (typeof rawHoursJson === "string" && rawHoursJson.trim().length > 0) {
    try {
      decodedHours = JSON.parse(rawHoursJson);
    } catch {
      return { error: "Working hours format was invalid. Please try again." };
    }
  }

  const parsed = updateScheduleSchema.safeParse({
    businessId: formData.get("businessId"),
    staffId: formData.get("staffId"),
    hours: decodedHours,
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  if (findScheduleOverlap(parsed.data.hours)) {
    return { error: "Working windows on the same day cannot overlap." };
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error } = await actor.supabase.rpc("set_staff_weekly_hours", {
    p_business_id: parsed.data.businessId,
    p_staff_id: parsed.data.staffId,
    p_hours: parsed.data.hours,
  });

  if (error) {
    if (error.message.includes("overlapping_weekly_hours") || error.code === "23514") {
      return { error: "Working windows on the same day cannot overlap." };
    }
    if (error.code === "42501") {
      return { error: "Only owners and managers can edit weekly hours." };
    }
    return { error: "Could not save weekly hours." };
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: "Weekly hours saved." };
}

export async function createTimeOffAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = createTimeOffSchema.safeParse({
    businessId: formData.get("businessId"),
    staffId: formData.get("staffId"),
    startLocal: formData.get("startLocal"),
    endLocal: formData.get("endLocal"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "staff");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const startIso = localDateTimeToUtcIso(parsed.data.startLocal, actor.timezone);
  if (!startIso) {
    return {
      error: "Start date and time is invalid for this shop's time zone.",
      fieldErrors: { startLocal: "Enter a valid local date and time." },
    };
  }

  const endIso = localDateTimeToUtcIso(parsed.data.endLocal, actor.timezone);
  if (!endIso) {
    return {
      error: "End date and time is invalid for this shop's time zone.",
      fieldErrors: { endLocal: "Enter a valid local date and time." },
    };
  }

  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return {
      error: "End time must be after start time.",
      fieldErrors: { endLocal: "End time must be after start time." },
    };
  }

  const { error } = await actor.supabase.from("time_off").insert({
    business_id: parsed.data.businessId,
    staff_id: parsed.data.staffId,
    period: `[${startIso},${endIso})`,
    reason: parsed.data.reason ?? null,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "You can only add time off for your own staff profile." };
    }
    if (error.code === "23514") {
      return { error: "Time off start and end range is invalid." };
    }
    return { error: "Could not save time off." };
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: "Time off added." };
}

export async function deleteTimeOffAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = deleteTimeOffSchema.safeParse({
    businessId: formData.get("businessId"),
    timeOffId: formData.get("timeOffId"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "staff");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error } = await actor.supabase
    .from("time_off")
    .delete()
    .eq("id", parsed.data.timeOffId)
    .eq("business_id", parsed.data.businessId);

  if (error) {
    return { error: "Could not remove time off entry." };
  }

  refreshBusiness(parsed.data.businessId);
  return { error: null, success: "Time off removed." };
}

export async function createInvitationAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = createInviteSchema.safeParse({
    businessId: formData.get("businessId"),
    role: formData.get("role"),
    staffId: formData.get("staffId") ?? "",
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "owner");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const staffId = parsed.data.role === "staff" ? parsed.data.staffId : undefined;
  const { data, error } = await actor.supabase.rpc("create_business_invitation", {
    p_business_id: parsed.data.businessId,
    p_role: parsed.data.role,
    p_staff_id: staffId,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.token) {
    if (error?.code === "42501") {
      return { error: "Only the business owner can create invite links." };
    }
    return { error: "Could not create invite link. Check staff selection and try again." };
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    success: "Invite link ready. Share it once — only this link contains the secret token.",
    invitePath: `/invite/${row.token}`,
  };
}

export async function revokeInvitationAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = revokeInviteSchema.safeParse({
    businessId: formData.get("businessId"),
    invitationId: formData.get("invitationId"),
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "owner");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error } = await actor.supabase
    .from("business_invitations")
    .delete()
    .eq("id", parsed.data.invitationId)
    .eq("business_id", parsed.data.businessId)
    .is("accepted_at", null);

  if (error) {
    return { error: "Could not revoke invite link." };
  }

  revalidatePath("/dashboard");
  return { error: null, success: "Invite link revoked." };
}

export async function createManualBookingAction(
  _prevState: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const parsed = createManualBookingSchema.safeParse({
    businessId: formData.get("businessId"),
    serviceId: formData.get("serviceId"),
    staffId: formData.get("staffId"),
    dateLocal: formData.get("dateLocal"),
    timeLocal: formData.get("timeLocal"),
    customerName: formData.get("customerName"),
    customerEmail: String(formData.get("customerEmail") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  });

  if (!parsed.success) {
    return firstValidationError(parsed.error);
  }

  const actor = await requireActor(parsed.data.businessId, "staff");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const startsAtIso = localDateTimeToUtcIso(
    `${parsed.data.dateLocal}T${parsed.data.timeLocal}`,
    actor.timezone,
  );
  if (!startsAtIso) {
    return {
      error: `That local time is invalid in ${actor.timezone} (check DST changeovers).`,
    };
  }

  const { data, error } = await actor.supabase.rpc("create_manual_booking", {
    p_business_id: parsed.data.businessId,
    p_service_id: parsed.data.serviceId,
    p_staff_id: parsed.data.staffId,
    p_starts_at: startsAtIso,
    p_customer_name: parsed.data.customerName,
    p_customer_email: parsed.data.customerEmail || undefined,
    p_customer_phone: parsed.data.customerPhone,
    p_notes: parsed.data.notes,
  });

  if (error) {
    if (error.message.includes("slot_unavailable") || error.code === "23P01") {
      return {
        error: "That specialist already has an overlapping booking at that time.",
      };
    }
    if (error.code === "42501") {
      return {
        error: "You can only create manual bookings for your own staff schedule.",
      };
    }
    if (error.message.includes("invalid_target")) {
      return {
        error: "Choose an active specialist and active service.",
      };
    }
    return { error: "Could not create manual booking. Please try again." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard");

  return {
    error: null,
    success: "Manual booking added.",
    managePath: row?.manage_token ? `/manage/${row.manage_token}` : null,
    createdDateKey: parsed.data.dateLocal,
  };
}

export async function updateBookingStatusAction(input: {
  businessId: string;
  bookingId: string;
  status: Enums<"booking_status">;
}): Promise<{ error: string | null; success?: string | null }> {
  const parsed = updateBookingStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid booking update." };
  }

  const actor = await requireActor(parsed.data.businessId, "staff");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error } = await actor.supabase.rpc("update_booking_status", {
    p_business_id: parsed.data.businessId,
    p_booking_id: parsed.data.bookingId,
    p_status: parsed.data.status,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "You can only update your own bookings." };
    }
    if (error.message.includes("booking_already_cancelled")) {
      return {
        error: "Cancelled bookings cannot be reopened. Create a new booking instead.",
      };
    }
    if (error.message.includes("booking_not_found")) {
      return { error: "Booking could not be found." };
    }
    return { error: "Could not update booking status." };
  }

  revalidatePath("/dashboard");
  return { error: null, success: "Booking status updated." };
}

export async function eraseBookingCustomerDataAction(input: {
  businessId: string;
  bookingId: string;
}): Promise<{ error: string | null; success?: string | null }> {
  const parsed = eraseBookingCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const actor = await requireActor(parsed.data.businessId, "manager");
  if (!actor.ok) {
    return { error: actor.error };
  }

  const { error } = await actor.supabase.rpc("erase_booking_customer_data", {
    p_business_id: parsed.data.businessId,
    p_booking_id: parsed.data.bookingId,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "Only owners and managers can erase client records." };
    }
    if (error.message.includes("booking_not_found")) {
      return { error: "Booking could not be found." };
    }
    return { error: "Could not erase customer data." };
  }

  revalidatePath("/dashboard");
  return { error: null, success: "Client details erased." };
}
