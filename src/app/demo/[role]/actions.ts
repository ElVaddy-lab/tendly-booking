"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseDemoRole, signInAsDemoRole } from "@/lib/demo-mode";

export type DemoSignInState = {
  error: string | null;
};

export async function enterDemoAction(formData: FormData): Promise<void> {
  const role = parseDemoRole(formData.get("role"));
  if (!role) {
    redirect("/");
  }

  const result = await signInAsDemoRole(role);
  if (!result.ok) {
    redirect("/sign-in");
  }

  revalidatePath("/dashboard");
  redirect(result.redirectTo);
}

export async function enterDemoWithFeedbackAction(
  _prevState: DemoSignInState,
  formData: FormData,
): Promise<DemoSignInState> {
  const role = parseDemoRole(formData.get("role"));
  if (!role) {
    return { error: "Choose Owner, Manager, or Staff to explore the demo." };
  }

  const result = await signInAsDemoRole(role);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard");
  redirect(result.redirectTo);
}
