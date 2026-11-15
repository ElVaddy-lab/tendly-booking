import type { Metadata } from "next";
import { Suspense } from "react";

import { pickSingleParam, sanitizeInviteNextPath } from "@/lib/redirect";

import { AuthFallback, AuthForm } from "../auth-form";

export const metadata: Metadata = {
  title: "Sign in — Tendly",
  description: "Sign in to manage your Tendly booking page, staff schedule, and appointments.",
};

async function SignInContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeInviteNextPath(pickSingleParam(params.next));
  return <AuthForm mode="sign-in" nextPath={nextPath} />;
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<AuthFallback mode="sign-in" />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}
