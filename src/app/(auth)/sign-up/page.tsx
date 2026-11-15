import type { Metadata } from "next";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = {
  title: "Start free — Tendly",
  description: "Create a Tendly account and set up your online booking page in two steps.",
};

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
