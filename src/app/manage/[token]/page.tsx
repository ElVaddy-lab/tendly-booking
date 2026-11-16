import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getManageBookingPageData } from "./data";
import { ManageFlow } from "./manage-flow";
import styles from "./manage.module.css";

export const metadata: Metadata = {
  title: "Manage booking — Tendly",
  description: "Review, reschedule, or cancel your Tendly appointment.",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

function ManageFallback() {
  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.brandCluster}>
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.skeletonCard} aria-label="Loading booking details">
          <p className={styles.rescheduleSubtitle}>Checking your appointment details…</p>
        </section>
      </main>
    </>
  );
}

async function ManageContent({ params }: PageProps) {
  const { token } = await params;
  const pageData = await getManageBookingPageData(token);

  if (!pageData.booking) {
    return (
      <>
        <header className={styles.topBar}>
          <div className={styles.brandCluster}>
            <Link href="/" className={styles.wordmark}>
              Tendly
            </Link>
          </div>
        </header>
        <main className={styles.main}>
          <section
            className={styles.unavailableCard}
            aria-labelledby="manage-unavailable-heading"
          >
            <div className={styles.unavailableHead}>
              <h1 id="manage-unavailable-heading" className={styles.unavailableTitle}>
                Booking link unavailable
              </h1>
            </div>
            <div className={styles.unavailableBody}>
              <p className={styles.errorAlert} role="alert">
                This booking link is invalid or has expired. If you need to change an
                upcoming visit, contact the shop directly.
              </p>
              <Link href="/" className={styles.primaryLink}>
                Back to Tendly
              </Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <ManageFlow
      token={token}
      initialBooking={pageData.booking}
      initialSlots={pageData.initialSlots}
      initialSlotsError={pageData.initialSlotsError}
      initialGeneratedAtIso={pageData.generatedAtIso}
    />
  );
}

export default function ManageBookingPage({ params }: PageProps) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<ManageFallback />}>
        <ManageContent params={params} />
      </Suspense>
    </div>
  );
}
