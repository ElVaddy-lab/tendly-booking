import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  DEMO_ACCOUNTS,
  DEMO_ROLES,
  parseDemoRole,
} from "@/lib/demo-mode";

import { enterDemoAction } from "./actions";
import styles from "./demo.module.css";

export const metadata: Metadata = {
  title: "Explore Demo — Tendly",
  description:
    "Sign in with one click to the fictional Northside Barbers demo dashboard as Owner, Manager, or Staff.",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return DEMO_ROLES.map((role) => ({ role }));
}

async function DemoRoleContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ role: string }>;
}) {
  const { role: rawRole } = await paramsPromise;
  const role = parseDemoRole(rawRole);
  if (!role) {
    notFound();
  }

  const info = DEMO_ACCOUNTS[role];

  return (
    <main className={styles.card}>
      <div className={styles.cardTop}>
        <Link href="/" className={styles.wordmark}>
          Tendly
        </Link>
        <span className={styles.demoTag}>Demo business · fictional</span>
      </div>

      <h1 className={styles.heading}>
        Northside Barbers as {info.roleLabel}
      </h1>
      <p className={styles.lead}>
        You are entering as <strong>{info.displayName}</strong> ({info.badge}).{" "}
        {info.description}
      </p>

      <div className={styles.metaGrid}>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Starting plan</span>
          <span className={styles.metaValue}>Free (3/3 staff · 5/5 services)</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Time zone</span>
          <span className={styles.metaValue}>Europe/Kyiv</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Public page</span>
          <Link href="/b/northside-barbers" className={styles.metaLink}>
            /b/northside-barbers
          </Link>
        </div>
      </div>

      <form action={enterDemoAction} className={styles.actions}>
        <input type="hidden" name="role" value={role} />
        <button type="submit" className={styles.primaryButton}>
          Enter dashboard as {info.roleLabel}
          <ArrowRight className={styles.arrow} aria-hidden="true" strokeWidth={1.75} />
        </button>
      </form>

      <p className={styles.note}>
        Shared demo workspace resets nightly at 03:00 UTC. Email, password, and
        Telegram settings are locked on demo accounts.
      </p>

      <nav className={styles.switchNav} aria-label="Switch demo role">
        <span>Switch role:</span>
        {DEMO_ROLES.map((r) => (
          <Link
            key={r}
            href={`/demo/${r}`}
            className={r === role ? styles.switchActive : styles.switchLink}
          >
            {DEMO_ACCOUNTS[r].roleLabel}
          </Link>
        ))}
      </nav>
    </main>
  );
}

export default function DemoRolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<main className={styles.card}>Loading demo workspace…</main>}>
        <DemoRoleContent paramsPromise={params} />
      </Suspense>
    </div>
  );
}
