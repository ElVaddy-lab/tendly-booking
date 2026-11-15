"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { resolvePostAuthPath } from "@/lib/onboarding";
import { sanitizeInviteNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import { isTurnstileTestMode, verifyTurnstileToken } from "@/lib/turnstile";

export type AuthActionState = {
  error: string | null;
};

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  turnstileToken: z.string().trim().min(1, "Complete the verification check."),
});

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters for your password.")
    .max(72, "Password must be 72 characters or fewer."),
  turnstileToken: z.string().trim().min(1, "Complete the verification check."),
});

async function getClientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return headerList.get("x-real-ip")?.trim() || null;
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    turnstileToken: formData.get("cf-turnstile-response"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your sign-in details." };
  }

  const remoteIp = await getClientIp();
  const verified = await verifyTurnstileToken(parsed.data.turnstileToken, remoteIp);
  if (!verified) {
    return { error: "Verification check failed. Reload and try again." };
  }

  const supabase = await createClient();
  const testMode = isTurnstileTestMode();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(testMode ? {} : { options: { captchaToken: parsed.data.turnstileToken } }),
  });

  if (error || !data.user) {
    if (error?.status === 429) {
      return { error: "Too many sign-in attempts. Wait a moment and try again." };
    }
    return { error: "Invalid email or password." };
  }

  const nextPath = sanitizeInviteNextPath(formData.get("next"));
  if (nextPath) {
    redirect(nextPath);
  }

  const destination = await resolvePostAuthPath(supabase, data.user.id);
  redirect(destination);
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    turnstileToken: formData.get("cf-turnstile-response"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your registration details." };
  }

  const remoteIp = await getClientIp();
  const verified = await verifyTurnstileToken(parsed.data.turnstileToken, remoteIp);
  if (!verified) {
    return { error: "Verification check failed. Reload and try again." };
  }

  const supabase = await createClient();
  const testMode = isTurnstileTestMode();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(testMode ? {} : { options: { captchaToken: parsed.data.turnstileToken } }),
  });

  if (error) {
    if (
      error.code === "user_already_exists" ||
      /already registered|already exists/i.test(error.message)
    ) {
      return { error: "An account with this email already exists. Sign in instead." };
    }
    if (error.status === 429) {
      return { error: "Too many sign-up attempts. Wait a moment and try again." };
    }
    return { error: error.message || "Could not create your account." };
  }

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: "An account with this email already exists. Sign in instead." };
  }

  const nextPath = sanitizeInviteNextPath(formData.get("next"));
  redirect(nextPath ?? "/onboarding");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    await supabase.auth.signOut();
  }
  redirect("/sign-in");
}
