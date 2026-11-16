import Link from "next/link";

import styles from "./booking.module.css";

export default function PublicBookingNotFound() {
  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brandCluster}>
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.noServicesCard} aria-labelledby="booking-not-found-title">
          <p className={styles.ticketEyebrow}>Unavailable link</p>
          <h1 id="booking-not-found-title" className={styles.businessName}>
            Booking page not found
          </h1>
          <p className={styles.ticketSub} style={{ marginTop: "10px" }}>
            This booking link does not match any active shop on Tendly.
          </p>
          <p style={{ marginTop: "20px" }}>
            <Link href="/" className={styles.manageLink}>
              Back to Tendly →
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
