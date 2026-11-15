import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { BookingCard } from "./_landing/booking-card";
import { RaceDemo } from "./_landing/race-demo";
import { upcomingDays } from "@/lib/demo-days";

// The demo shop's next five bookable days, in its own time zone. Refreshed hourly.
async function demoDays() {
  "use cache";
  cacheLife("hours");
  return upcomingDays(new Date(), "Europe/Kyiv");
}
import styles from "./_landing/landing.module.css";

export default async function Home() {
  const days = await demoDays();
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Image
          className={styles.ground}
          src="/plates/wood-ground.png"
          alt=""
          fill
          priority
          sizes="100vw"
        />

        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <ul className={styles.navLinks}>
            <li>
              <a className={styles.navLink} href="#product">
                Product
              </a>
            </li>
            <li>
              <a className={styles.navLink} href="#pricing">
                Pricing
              </a>
            </li>
            <li>
              <a className={styles.navLink} href="#demo">
                Demo
              </a>
            </li>
          </ul>
          <div className={styles.navEnd}>
            <Link className={styles.navLink} href="/sign-in">
              Sign in
            </Link>
            <Link className={styles.cta} href="/sign-up">
              Start free
            </Link>
          </div>
        </nav>

        <h1 className={styles.headline}>
          <span className={styles.line}>
            Keep every chair
            <span className={styles.inlinePhoto}>
              <Image
                src="/plates/headline-photo.png"
                alt="A barber cutting a client's hair"
                width={754}
                height={312}
                sizes="(min-width: 768px) 10vw, 30vw"
                priority
              />
            </span>
            full
          </span>
          <span className={styles.line}>
            and every day
            <span className={styles.clock}>
              <Image
                className={styles.clockFace}
                src="/plates/headline-clock-face.png"
                alt=""
                width={128}
                height={128}
                sizes="64px"
              />
              <span className={styles.clockTime}>10:30</span>
            </span>
            calm.
          </span>
        </h1>

        <p className={styles.subline}>
          Online booking for barbershops and salons. Clients pick a barber and a time from their phone. Tendly keeps
          the schedule clean.
        </p>

        <BookingCard days={days} />

        <p className={styles.roles} id="demo">
          Or explore the dashboard as <Link href="/demo/owner">Owner</Link>,{" "}
          <Link href="/demo/manager">Manager</Link> or <Link href="/demo/staff">Staff</Link>
        </p>
      </header>

      <main>
        <section className={styles.next} id="product" aria-labelledby="product-title">
          <h2 id="product-title" className={styles.sectionTitle}>
            Built so the schedule can&rsquo;t break.
          </h2>
          <p className={styles.sectionLead}>
            The hard parts of a booking app live in the database, not in the page. That is what keeps a full day
            calm.
          </p>

          <div className={styles.proofs}>
            <article className={styles.proof}>
              <div className={styles.proofText}>
                <h3 className={styles.proofTitle}>Two people, one slot. One booking.</h3>
                <p>
                  When two clients press Book for 10:30 at the same moment, Postgres accepts one and refuses the
                  other. The second client sees the slot is already taken and picks another time.
                </p>
              </div>
              <RaceDemo />
            </article>

            <article className={styles.proof}>
              <div className={styles.proofText}>
                <h3 className={styles.proofTitle}>Their time zone, your opening hours.</h3>
                <p>
                  Slots are built in the shop&rsquo;s local time and shown in each client&rsquo;s own zone. The night
                  the clocks change, a 09:00 opening stays at 09:00.
                </p>
              </div>
              <dl className={styles.zones} aria-label="One slot in three time zones">
                <div>
                  <dt>Shop · Kyiv</dt>
                  <dd>09:00</dd>
                </div>
                <div>
                  <dt>Client · Warsaw</dt>
                  <dd>08:00</dd>
                </div>
                <div>
                  <dt>Client · New York</dt>
                  <dd>02:00</dd>
                </div>
              </dl>
            </article>

            <article className={styles.proof}>
              <div className={styles.proofText}>
                <h3 className={styles.proofTitle}>Everyone hears about it.</h3>
                <p>
                  Barbers get new bookings and cancellations in Telegram. Clients get a calendar file and a private
                  link to cancel or reschedule, with no account to create.
                </p>
              </div>
              <ul className={styles.notes} aria-label="What each side receives">
                <li>
                  <span className={styles.noteFrom}>Telegram · to Marta</span>
                  New booking: Haircut, Tue 10:30
                </li>
                <li>
                  <span className={styles.noteFrom}>Client</span>
                  northside-haircut.ics · Manage booking
                </li>
              </ul>
            </article>
          </div>
        </section>

        <div className={styles.lower}>
        <section className={styles.pricing} id="pricing" aria-labelledby="pricing-title">
          <h2 id="pricing-title" className={styles.sectionTitleDark}>
            Two plans. Upgrade when the chairs fill up.
          </h2>
          <div className={styles.priceList}>
            <div className={styles.plan}>
              <h3 className={styles.planName}>Free</h3>
              <p className={styles.planPrice}>
                $0 <span>forever</span>
              </p>
              <ul className={styles.planItems}>
                <li>Up to 3 staff</li>
                <li>Up to 5 services</li>
                <li>100 bookings a month</li>
                <li>Public booking page and manage links</li>
              </ul>
              <Link className={styles.planButtonQuiet} href="/sign-up">
                Start free
              </Link>
            </div>
            <div className={styles.plan}>
              <h3 className={styles.planName}>Pro</h3>
              <p className={styles.planPrice}>
                $19 <span>per month</span>
              </p>
              <ul className={styles.planItems}>
                <li>Up to 10 staff</li>
                <li>Unlimited services and bookings</li>
                <li>Telegram notifications for staff</li>
                <li>Calendar feed for every barber</li>
              </ul>
              <Link className={styles.planButton} href="/sign-up">
                Start with Pro
              </Link>
            </div>
          </div>
          <p className={styles.priceNote}>Checkout runs on Stripe in test mode in this demo. No real card is charged.</p>
        </section>

        <section className={styles.roles2} aria-labelledby="roles-title">
          <h2 id="roles-title" className={styles.sectionTitleDark}>
            See the dashboard from every chair.
          </h2>
          <ul className={styles.roleList}>
            <li>
              <Link className={styles.roleLink} href="/demo/owner">
                <span className={styles.roleName}>Owner</span>
                <span className={styles.roleWhat}>Billing, settings, the whole team</span>
                <ArrowRight className={styles.roleArrow} aria-hidden="true" strokeWidth={1.5} />
              </Link>
            </li>
            <li>
              <Link className={styles.roleLink} href="/demo/manager">
                <span className={styles.roleName}>Manager</span>
                <span className={styles.roleWhat}>Schedules, services, every booking</span>
                <ArrowRight className={styles.roleArrow} aria-hidden="true" strokeWidth={1.5} />
              </Link>
            </li>
            <li>
              <Link className={styles.roleLink} href="/demo/staff">
                <span className={styles.roleName}>Staff</span>
                <span className={styles.roleWhat}>Own schedule and own bookings only</span>
                <ArrowRight className={styles.roleArrow} aria-hidden="true" strokeWidth={1.5} />
              </Link>
            </li>
          </ul>
          <p className={styles.priceNote}>One click signs you in to a shared demo account. Demo data resets every night.</p>
        </section>
          <footer className={styles.footer}>
            <span className={styles.footerMark}>Tendly</span>
            <p>
              A portfolio demo built with Next.js, Supabase and Stripe. Northside Barbers, its barbers, clients and
              bookings are fictional.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
