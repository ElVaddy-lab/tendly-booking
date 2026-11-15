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
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <div className={styles.navActions}>
            <span className={styles.stepPill}>{ctx.business ? "Step 2 of 2" : "Step 1 of 2"}</span>
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
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
        </nav>
      </header>
      <main className={styles.main}>
        <div
          className={`${styles.workbench} ${styles.fallbackWorkbench}`}
          role="status"
          aria-live="polite"
        >
          <div className={styles.rail} aria-hidden="true">
            <div className={styles.stepList}>
              <div className={styles.stepItem}>
                <div className={styles.stepLineColumn}>
                  <span className={`${styles.stepBadge} ${styles.skeletonBadge}`} />
                  <span className={styles.stepConnector} />
                </div>
                <div className={styles.stepContent}>
                  <span className={`${styles.skeletonBar} ${styles.skeletonStepTitle}`} />
                  <span className={`${styles.skeletonBar} ${styles.skeletonStepMeta}`} />
                  <span className={`${styles.skeletonBar} ${styles.skeletonStepMetaShort}`} />
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepLineColumn}>
                  <span className={`${styles.stepBadge} ${styles.skeletonBadge}`} />
                </div>
                <div className={styles.stepContent}>
                  <span className={`${styles.skeletonBar} ${styles.skeletonStepTitle}`} />
                  <span className={`${styles.skeletonBar} ${styles.skeletonStepMeta}`} />
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.fallbackCard}`}>
            <div className={styles.cardHead}>
              <p className={styles.title}>Loading setup…</p>
            </div>
            <div className={styles.form} aria-hidden="true">
              <div className={styles.field}>
                <span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />
                <span className={styles.skeletonInput} />
              </div>
              <div className={styles.field}>
                <span className={`${styles.skeletonBar} ${styles.skeletonLabelWide}`} />
                <span className={styles.skeletonInput} />
                <span className={`${styles.skeletonBar} ${styles.skeletonHint}`} />
              </div>
              <div className={styles.field}>
                <span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />
                <span className={styles.skeletonInput} />
                <span className={`${styles.skeletonBar} ${styles.skeletonHintWide}`} />
              </div>
              <div className={styles.submitRow}>
                <span className={styles.skeletonButton} />
              </div>
            </div>
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
