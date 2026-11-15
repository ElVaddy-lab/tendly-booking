import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

import { InviteAcceptForm } from "./invite-card";
import styles from "./invite.module.css";

export const metadata: Metadata = {
  title: "Team invitation — Tendly",
  description: "Accept your Tendly shop team invitation.",
};

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shopInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "T";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

async function InviteContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: claimsData }, { data: inviteRows }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_business_invitation", { p_token: token }),
  ]);

  const userId = claimsData?.claims?.sub ?? null;
  const rawEmail = claimsData?.claims?.email;
  const userEmail = typeof rawEmail === "string" ? rawEmail : null;
  const invite = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;

  const header = (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/" className={styles.wordmark}>
          Tendly
        </Link>
        {!userId ? (
          <Link href="/sign-in" className={styles.navLink}>
            Sign in
          </Link>
        ) : null}
      </nav>
    </header>
  );

  if (!invite || !invite.is_valid) {
    return (
      <>
        {header}
        <main className={styles.main}>
          <section className={styles.card} aria-labelledby="invite-invalid-heading">
            <div className={styles.passHeader}>
              <h1 id="invite-invalid-heading" className={styles.title}>
                Invitation unavailable
              </h1>
            </div>
            <div className={styles.passSheet}>
              <p className={styles.error} role="alert">
                This invite link is invalid, has expired, or has already been accepted. Ask the
                business owner for a fresh invite link.
              </p>
              <Link href="/" className={styles.submitLink}>
                Back to Tendly
              </Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  const nextUrl = `/invite/${token}`;
  const signUpHref = `/sign-up?next=${encodeURIComponent(nextUrl)}`;
  const signInHref = `/sign-in?next=${encodeURIComponent(nextUrl)}`;
  const initials = shopInitials(invite.business_name);

  return (
    <>
      {header}
      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="invite-heading">
          <div className={styles.passHeader}>
            <div className={styles.seal} aria-hidden="true">
              <span>{initials}</span>
            </div>
            <h1 id="invite-heading" className={styles.title}>
              {invite.business_name}
            </h1>
            <span className={styles.roleTag}>{invite.role}</span>
            <div className={styles.passMetaGroup}>
              <p className={styles.passMeta}>
                Booking page: /b/{invite.business_slug}
                {invite.staff_name ? ` · Linked to ${invite.staff_name}` : ""}
              </p>
              <p className={styles.passExpiry}>Expires {formatExpiry(invite.expires_at)}</p>
            </div>
          </div>

          <div className={styles.passSheet}>
            {userId ? (
              <>
                <InviteAcceptForm
                  token={token}
                  businessName={invite.business_name}
                  role={invite.role}
                  staffName={invite.staff_name || null}
                  needsDisplayName={invite.role === "staff" && !invite.staff_id}
                />
                <div className={styles.accountFooter}>
                  {userEmail ? <span>Signed in as {userEmail}</span> : null}
                  <form action={signOutAction} className={styles.inlineSignOutForm}>
                    <button type="submit" className={styles.switchAccountLink}>
                      Use a different account
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p className={styles.lead}>
                  You have been invited to join <strong>{invite.business_name}</strong>. Sign up
                  or sign in to accept your role.
                </p>

                <Link href={signUpHref} className={styles.submitLink}>
                  Create account to accept
                </Link>
                <Link href={signInHref} className={styles.secondaryLink}>
                  Sign in with existing account
                </Link>
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function InviteFallback() {
  return (
    <>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
        </nav>
      </header>
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.passHeader}>
            <h1 className={styles.title}>Loading invitation…</h1>
          </div>
          <div className={styles.passSheet}>
            <p className={styles.lead}>Checking your invitation details.</p>
          </div>
        </section>
      </main>
    </>
  );
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<InviteFallback />}>
        <InviteContent params={params} />
      </Suspense>
    </div>
  );
}
