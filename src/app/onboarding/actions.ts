"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  businessStepSchema,
  parsePriceToCents,
  serviceScheduleStepSchema,
} from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

export type OnboardingActionState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
};

export async function createBusinessAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/sign-in");
  }

  const parsed = businessStepSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      error: parsed.error.issues[0]?.message ?? "Check your business details.",
      fieldErrors,
    };
  }

  const { error } = await supabase.rpc("create_business", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_timezone: parsed.data.timezone,
  });

  if (error) {
    if (error.message.includes("already_owns_business")) {
      redirect("/onboarding");
    }
    if (error.code === "23505" || error.message.includes("slug_taken")) {
      return {
        error: "That URL slug is already taken. Try another one.",
        fieldErrors: { slug: "That URL slug is already taken. Try another one." },
      };
    }
    if (error.message.includes("slug_reserved")) {
      return {
        error: "That URL slug is reserved.",
        fieldErrors: { slug: "That URL slug is reserved." },
      };
    }
    if (error.code === "23514") {
      return {
        error: "Check your business name, URL slug, and time zone.",
      };
    }
    return { error: "Could not create your business. Please try again." };
  }

  updateTag(`business-slug:${parsed.data.slug}`);
  redirect("/onboarding");
}

export async function completeOnboardingAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/sign-in");
  }

  const priceCents = parsePriceToCents(String(formData.get("priceDollars") ?? ""));
  if (priceCents === "invalid") {
    return {
      error: "Enter a valid price (for example 35 or 35.00), or leave it blank.",
      fieldErrors: { priceDollars: "Enter a valid price." },
    };
  }

  const parsed = serviceScheduleStepSchema.safeParse({
    businessId: formData.get("businessId"),
    staffName: formData.get("staffName"),
    serviceName: formData.get("serviceName"),
    durationMin: formData.get("durationMin"),
    bufferMin: formData.get("bufferMin"),
    priceCents,
    weekdays: formData.getAll("weekdays"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      error: parsed.error.issues[0]?.message ?? "Check your service and working hours.",
      fieldErrors,
    };
  }

  const { error } = await supabase.rpc("complete_onboarding", {
    p_business_id: parsed.data.businessId,
    p_staff_name: parsed.data.staffName,
    p_service_name: parsed.data.serviceName,
    p_duration_min: parsed.data.durationMin,
    p_buffer_min: parsed.data.bufferMin,
    p_price_cents: parsed.data.priceCents ?? undefined,
    p_weekdays: parsed.data.weekdays,
    p_start_time: parsed.data.startTime,
    p_end_time: parsed.data.endTime,
  });

  if (error) {
    if (error.message.includes("weekdays_required")) {
      return {
        error: "Pick at least one working day.",
        fieldErrors: { weekdays: "Pick at least one working day." },
      };
    }
    if (error.code === "42501") {
      return { error: "Only a business owner or manager can finish setup." };
    }
    if (error.code === "23514") {
      return { error: "Check your service duration, buffer, and working hours." };
    }
    return { error: "Could not save your setup. Please try again." };
  }

  updateTag(`business:${parsed.data.businessId}`);
  redirect("/dashboard");
}
