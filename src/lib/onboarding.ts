import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database, Enums } from "@/types/database.generated";

type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type StaffSummary = Pick<
  Database["public"]["Tables"]["staff"]["Row"],
  "id" | "display_name" | "is_active" | "member_user_id"
>;
type ServiceSummary = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name" | "duration_min" | "buffer_min" | "price_cents" | "currency" | "is_active"
>;
type WeeklyHoursSummary = Pick<
  Database["public"]["Tables"]["weekly_hours"]["Row"],
  "id" | "staff_id" | "weekday" | "start_time" | "end_time"
>;

export type OnboardingContext = {
  userId: string;
  email: string | null;
  membership: {
    businessId: string;
    role: Enums<"member_role">;
  } | null;
  business: BusinessRow | null;
  staff: StaffSummary[];
  services: ServiceSummary[];
  weeklyHours: WeeklyHoursSummary[];
  hasServiceAndSchedule: boolean;
};

/**
 * Resolves the signed-in user's business membership and setup progress via RLS.
 * Redirects unauthenticated callers to /sign-in.
 */
export async function getOnboardingContext(): Promise<OnboardingContext> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/sign-in");
  }

  const rawEmail = claimsData?.claims?.email;
  const email = typeof rawEmail === "string" ? rawEmail : null;

  const { data: memberRow } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const business = memberRow?.businesses ?? null;
  if (!memberRow || !business) {
    return {
      userId,
      email,
      membership: null,
      business: null,
      staff: [],
      services: [],
      weeklyHours: [],
      hasServiceAndSchedule: false,
    };
  }

  const [{ data: staff }, { data: services }, { data: weeklyHours }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, display_name, is_active, member_user_id")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("services")
      .select("id, name, duration_min, buffer_min, price_cents, currency, is_active")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("weekly_hours")
      .select("id, staff_id, weekday, start_time, end_time")
      .eq("business_id", business.id)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  const staffList = staff ?? [];
  const serviceList = services ?? [];
  const hoursList = weeklyHours ?? [];

  return {
    userId,
    email,
    membership: {
      businessId: memberRow.business_id,
      role: memberRow.role,
    },
    business,
    staff: staffList,
    services: serviceList,
    weeklyHours: hoursList,
    hasServiceAndSchedule:
      staffList.length > 0 && serviceList.length > 0 && hoursList.length > 0,
  };
}

/**
 * Determines where a signed-in user should land after authenticating.
 */
export async function resolvePostAuthPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<"/onboarding" | "/dashboard"> {
  const { data: memberRow } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!memberRow) {
    return "/onboarding";
  }

  if (memberRow.role !== "owner") {
    return "/dashboard";
  }

  const [{ count: staffCount }, { count: serviceCount }, { count: hoursCount }] = await Promise.all([
    supabase
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("business_id", memberRow.business_id),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("business_id", memberRow.business_id),
    supabase
      .from("weekly_hours")
      .select("id", { count: "exact", head: true })
      .eq("business_id", memberRow.business_id),
  ]);

  if ((staffCount ?? 0) > 0 && (serviceCount ?? 0) > 0 && (hoursCount ?? 0) > 0) {
    return "/dashboard";
  }

  return "/onboarding";
}
