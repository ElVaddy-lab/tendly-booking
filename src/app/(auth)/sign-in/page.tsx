import type { Metadata } from "next";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = {
  title: "Sign in — Tendly",
  description: "Sign in to manage your Tendly booking page, staff schedule, and appointments.",
};

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
