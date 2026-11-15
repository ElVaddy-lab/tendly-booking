import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { getOnboardingContext } from "@/lib/onboarding";

import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "Dashboard — Tendly",
  description: "Manage your shop's services, staff schedule, and upcoming appointments.",
};

const WEEKDAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

function formatPrice(priceCents: number | null, currency: string): string {
  if (priceCents === null) {
    return "Free / unpriced";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceCents / 100);
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

async function DashboardContent() {
  const ctx = await getOnboardingContext();

  if (!ctx.business || !ctx.membership) {
    redirect("/onboarding");
  }

  if (ctx.membership.role === "owner" && !ctx.hasServiceAndSchedule) {
    redirect("/onboarding");
  }

  const { business, membership, staff, services, weeklyHours } = ctx;
  const publicPath = `/b/${business.slug}`;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandGroup}>
            <Link href="/" className={styles.wordmark}>
              Tendly
            </Link>
            <span className={styles.divider} aria-hidden="true">
              /
            </span>
            <span className={styles.businessName}>{business.name}</span>
            <span className={styles.pillTag}>{membership.role}</span>
            {business.is_demo && (
              <span className={styles.pillTag}>Demo business, fictional</span>
            )}
          </div>

          <div className={styles.actions}>
            <Link href={publicPath} prefetch={false} className={styles.publicLink}>
              {publicPath}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={styles.signOutButton}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{business.name}</h1>
          <p className={styles.subtitle}>
            {ctx.email ? `Signed in as ${ctx.email}` : "Shop workspace"}
          </p>
        </div>

        <section className={styles.summaryGrid} aria-label="Business summary">
          <article className={styles.panel}>
            <div className={styles.metricBody}>
              <p className={styles.metricLabel}>Public booking path</p>
              <p className={styles.metricValue}>{publicPath}</p>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.metricBody}>
              <p className={styles.metricLabel}>Shop time zone</p>
              <p className={styles.metricValue}>{business.timezone}</p>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.metricBody}>
              <p className={styles.metricLabel}>Slot cadence &amp; notice</p>
              <p className={styles.metricValue}>
                Every {business.slot_step_minutes} min · {business.min_notice_minutes} min notice
              </p>
            </div>
          </article>
        </section>

        <section className={styles.detailGrid} aria-label="Services and team schedule">
          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Services</h2>
              <span className={styles.panelMeta}>{services.length} configured</span>
            </div>
            <ul className={styles.list}>
              {services.map((service) => (
                <li key={service.id} className={styles.listItem}>
                  <span className={styles.itemName}>
                    {service.name}
                    {!service.is_active ? " (inactive)" : ""}
                  </span>
                  <span className={styles.itemMeta}>
                    {service.duration_min} min
                    {service.buffer_min > 0 ? ` (+${service.buffer_min} min buffer)` : ""} ·{" "}
                    {formatPrice(service.price_cents, service.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Staff &amp; weekly hours</h2>
              <span className={styles.panelMeta}>{staff.length} active</span>
            </div>
            <div>
              {staff.map((member) => {
                const memberHours = weeklyHours.filter((row) => row.staff_id === member.id);
                return (
                  <div key={member.id} className={styles.staffCard}>
                    <div className={styles.staffHead}>
                      <span className={styles.itemName}>{member.display_name}</span>
                      <span className={styles.panelMeta}>
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {memberHours.length > 0 ? (
                      <ul className={styles.hoursList}>
                        {memberHours.map((slot) => (
                          <li key={slot.id} className={styles.hoursRow}>
                            <span>{WEEKDAY_NAMES[slot.weekday] ?? `Day ${slot.weekday}`}</span>
                            <span>{formatTimeRange(slot.start_time, slot.end_time)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.metricLabel}>No working hours set yet.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}

function DashboardFallback() {
  return (
    <main className={styles.main}>
      <div className={styles.panel}>
        <div className={styles.metricBody}>
          <p className={styles.metricLabel}>Loading dashboard…</p>
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<DashboardFallback />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
