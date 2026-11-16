import { cacheLife, cacheTag, io } from "next/cache";

import type { RawAvailableSlot } from "@/lib/booking-slots";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type PublicBusiness = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  min_notice_minutes: number;
  booking_horizon_days: number;
  slot_step_minutes: number;
  cancellation_deadline_hours: number;
  is_demo: boolean;
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price_cents: number | null;
  currency: string;
};

export type PublicStaff = {
  id: string;
  display_name: string;
};

export type PublicStaffService = {
  staff_id: string;
  service_id: string;
};

export type PublicCatalog = {
  business: PublicBusiness;
  services: PublicService[];
  staff: PublicStaff[];
  staffServices: PublicStaffService[];
};

const MAX_RPC_WINDOW_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;

/**
 * Fetches the public business profile and active booking catalog using Next.js 16
 * Cache Components (`use cache`). Never reads cookies or dynamic request I/O.
 */
export async function getPublicBusinessCatalog(
  slug: string,
): Promise<PublicCatalog | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`business-slug:${slug}`);

  const supabase = createPublicSupabaseClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(
      "id, slug, name, timezone, min_notice_minutes, booking_horizon_days, slot_step_minutes, cancellation_deadline_hours, is_demo",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (businessError || !business) {
    return null;
  }

  cacheTag(`business:${business.id}`);

  const [servicesRes, staffRes, linksRes] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, description, duration_min, buffer_min, price_cents, currency")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("staff")
      .select("id, display_name")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("staff_services")
      .select("staff_id, service_id")
      .eq("business_id", business.id),
  ]);

  return {
    business,
    services: servicesRes.data ?? [],
    staff: staffRes.data ?? [],
    staffServices: linksRes.data ?? [],
  };
}

export async function fetchAvailableSlotsWindow(input: {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  fromIso?: string;
}): Promise<{ slots: RawAvailableSlot[]; error: string | null }> {
  const supabase = createPublicSupabaseClient();
  const now = new Date();
  const parsedFrom = input.fromIso ? new Date(input.fromIso) : null;
  const start =
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) && parsedFrom > now
      ? parsedFrom
      : now;
  const end = new Date(start.getTime() + MAX_RPC_WINDOW_MS);

  const { data, error } = await supabase.rpc("available_slots", {
    p_business_id: input.businessId,
    p_service_id: input.serviceId,
    p_staff_id: input.staffId ?? undefined,
    p_from: start.toISOString(),
    p_to: end.toISOString(),
  });

  if (error) {
    return { slots: [], error: "Could not load available times." };
  }

  return {
    slots: (data ?? []) as RawAvailableSlot[],
    error: null,
  };
}

/**
 * Dynamic request-time slot loader rendered inside `<Suspense>` so slots and
 * booking availability are never cached.
 */
export async function getInitialAvailableSlots(input: {
  businessId: string;
  serviceId: string;
  staffId: string | null;
}): Promise<{
  slots: RawAvailableSlot[];
  error: string | null;
  generatedAtIso: string;
}> {
  await io();
  const generatedAtIso = new Date().toISOString();
  const result = await fetchAvailableSlotsWindow(input);
  return {
    slots: result.slots,
    error: result.error,
    generatedAtIso,
  };
}
