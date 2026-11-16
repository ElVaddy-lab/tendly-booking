"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { mapPlanLimitError } from "@/lib/stripe-billing";
import { createClient } from "@/lib/supabase/server";

export type AcceptInviteState = {
  error: string | null;
};

const acceptInviteSchema = z.object({
  token: z.string().trim().min(16, "Invalid invitation link."),
  displayName: z
    .string()
    .trim()
    .max(60, "Display name must be 60 characters or fewer.")
    .optional(),
});

export async function acceptInvitationAction(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    displayName: formData.get("displayName") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check your invitation details.",
    };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect(`/sign-in?next=${encodeURIComponent(`/invite/${parsed.data.token}`)}`);
  }

  const { error } = await supabase.rpc("accept_business_invitation", {
    p_token: parsed.data.token,
    p_display_name: parsed.data.displayName || undefined,
  });

  if (error) {
    const planLimitMessage = mapPlanLimitError(error, "staff");
    if (planLimitMessage) {
      return { error: planLimitMessage };
    }
    if (
      error.message.includes("already_belongs") ||
      error.message.includes("already_member") ||
      error.code === "23505"
    ) {
      return {
        error:
          "This account already belongs to a business workspace. Sign out and use another account to accept.",
      };
    }
    if (error.message.includes("invitation") || error.code === "P0002") {
      return {
        error: "This invitation link is invalid, has expired, or has already been used.",
      };
    }
    if (error.code === "42501") {
      redirect(`/sign-in?next=${encodeURIComponent(`/invite/${parsed.data.token}`)}`);
    }
    return { error: "Could not accept invitation. Please try again." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
