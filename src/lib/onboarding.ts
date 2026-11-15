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

type StaffServiceSummary = Pick<
  Database["public"]["Tables"]["staff_services"]["Row"],
  "staff_id" | "service_id"
>;
type TimeOffSummary = Pick<
  Database["public"]["Tables"]["time_off"]["Row"],
  "id" | "staff_id" | "period" | "reason"
>;
type MemberSummary = Pick<
  Database["public"]["Tables"]["business_members"]["Row"],
  "user_id" | "role" | "created_at"
>;
type InvitationSummary = Pick<
  Database["public"]["Tables"]["business_invitations"]["Row"],
  "id" | "role" | "staff_id" | "expires_at" | "created_at"
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

export type DashboardData = OnboardingContext & {
  staffServices: StaffServiceSummary[];
  timeOff: TimeOffSummary[];
  members: MemberSummary[];
  invitations: InvitationSummary[];
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
 * Loads full dashboard admin data for the signed-in user's business.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const ctx = await getOnboardingContext();

  if (!ctx.business || !ctx.membership) {
    return {
      ...ctx,
      staffServices: [],
      timeOff: [],
      members: [],
      invitations: [],
    };
  }

  const supabase = await createClient();
  const businessId = ctx.business.id;
  const isOwner = ctx.membership.role === "owner";

  const [{ data: staffServices }, { data: timeOff }, { data: members }, { data: invitations }] =
    await Promise.all([
      supabase
        .from("staff_services")
        .select("staff_id, service_id")
        .eq("business_id", businessId),
      supabase
        .from("time_off")
        .select("id, staff_id, period, reason")
        .eq("business_id", businessId)
        .order("period", { ascending: true }),
      supabase
        .from("business_members")
        .select("user_id, role, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true }),
      isOwner
        ? supabase
            .from("business_invitations")
            .select("id, role, staff_id, expires_at, created_at")
            .eq("business_id", businessId)
            .is("accepted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as InvitationSummary[] }),
    ]);

  return {
    ...ctx,
    staffServices: staffServices ?? [],
    timeOff: timeOff ?? [],
    members: members ?? [],
    invitations: invitations ?? [],
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
