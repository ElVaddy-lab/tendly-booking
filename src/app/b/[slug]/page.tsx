import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import styles from "./booking.module.css";
import { BookingFlow } from "./booking-flow";
import {
  getInitialAvailableSlots,
  getPublicBusinessCatalog,
} from "./data";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getPublicBusinessCatalog(slug);

  if (!catalog) {
    return {
      title: "Business not found | Tendly",
    };
  }

  return {
    title: `${catalog.business.name} — Book online | Tendly`,
    description: `Book an appointment online with ${catalog.business.name}.`,
  };
}

function BookingPageSkeleton() {
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
        <section className={styles.skeletonCard} aria-label="Loading booking page">
          <p className={styles.ticketSub}>Loading booking availability…</p>
        </section>
      </main>
    </>
  );
}

async function BookingContent({ params }: PageProps) {
  const { slug } = await params;
  const catalog = await getPublicBusinessCatalog(slug);

  if (!catalog) {
    notFound();
  }

  const initialServiceId = catalog.services[0]?.id ?? "";
  if (!initialServiceId) {
    return (
      <BookingFlow
        catalog={catalog}
        initialServiceId=""
        initialSlots={[]}
        initialGeneratedAtIso="2026-01-01T00:00:00.000Z"
        initialSlotsError={null}
      />
    );
  }

  const slotResult = await getInitialAvailableSlots({
    businessId: catalog.business.id,
    serviceId: initialServiceId,
    staffId: null,
  });

  return (
    <BookingFlow
      catalog={catalog}
      initialServiceId={initialServiceId}
      initialSlots={slotResult.slots}
      initialGeneratedAtIso={slotResult.generatedAtIso}
      initialSlotsError={slotResult.error}
    />
  );
}

export default function PublicBookingPage({ params }: PageProps) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<BookingPageSkeleton />}>
        <BookingContent params={params} />
      </Suspense>
    </div>
  );
}
