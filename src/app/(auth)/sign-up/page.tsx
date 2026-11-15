import type { Metadata } from "next";
import { Suspense } from "react";

import { pickSingleParam, sanitizeInviteNextPath } from "@/lib/redirect";

import { AuthFallback, AuthForm } from "../auth-form";

export const metadata: Metadata = {
  title: "Start free — Tendly",
  description: "Create a Tendly account and set up your online booking page in two steps.",
};

async function SignUpContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeInviteNextPath(pickSingleParam(params.next));
  return <AuthForm mode="sign-up" nextPath={nextPath} />;
}

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<AuthFallback mode="sign-up" />}>
      <SignUpContent searchParams={searchParams} />
    </Suspense>
  );
}
