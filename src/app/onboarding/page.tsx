import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { getOnboardingContext } from "@/lib/onboarding";

import { BusinessStepForm, ServiceScheduleStepForm } from "./onboarding-forms";
import styles from "./onboarding.module.css";

export const metadata: Metadata = {
  title: "Setup — Tendly",
  description: "Set up your Tendly booking page, first service, and working hours.",
};

async function OnboardingContent() {
  const ctx = await getOnboardingContext();

  if (ctx.membership && ctx.hasServiceAndSchedule) {
    redirect("/dashboard");
  }

  if (ctx.membership && ctx.membership.role !== "owner") {
    redirect("/dashboard");
  }

  return (
    <>
      <header>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <div className={styles.navActions}>
            {ctx.email && <span className={styles.navMeta}>{ctx.email}</span>}
            <form action={signOutAction}>
              <button type="submit" className={styles.signOutButton}>
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>

      <main className={styles.main}>
        {ctx.business ? (
          <ServiceScheduleStepForm business={ctx.business} />
        ) : (
          <BusinessStepForm />
        )}
      </main>
    </>
  );
}

function OnboardingFallback() {
  return (
    <>
      <header>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <p className={styles.stepLabel}>Loading setup…</p>
          </div>
        </div>
      </main>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<OnboardingFallback />}>
        <OnboardingContent />
      </Suspense>
    </div>
  );
}
