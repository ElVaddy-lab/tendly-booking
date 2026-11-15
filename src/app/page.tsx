import Image from "next/image";
import { Check, Globe, Lock, MapPin, MessageSquare, Send } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { BookingCard } from "./_landing/booking-card";
import { RaceDemo } from "./_landing/race-demo";
import { RoleSwitcher } from "./_landing/role-switcher";
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
          <div className={styles.sectionHeader}>
            <h2 id="product-title" className={styles.sectionTitle}>
              Built so the schedule{" "}
              <span className={styles.lockChip} aria-hidden="true">
                <Lock className={styles.lockIcon} strokeWidth={1.75} />
                10:30
              </span>{" "}
              can&rsquo;t break.
            </h2>
            <p className={styles.sectionLead}>
              The hard parts of a booking app live in the database, not in the page. That is what keeps a full day
              calm.
            </p>
          </div>

          <div className={styles.proofs}>
            <article className={styles.proof}>
              <div className={styles.proofWidget}>
                <RaceDemo />
              </div>
              <div className={styles.proofText}>
                <h3 className={styles.proofTitle}>Two people, one slot. One booking.</h3>
                <p>
                  When two clients press Book for 10:30 at the same moment, Postgres accepts one and refuses the
                  other. The second client sees the slot is already taken and picks another time.
                </p>
              </div>
            </article>

            <article className={styles.proof}>
              <div className={styles.proofWidget}>
                <dl className={styles.zones} aria-label="One slot in three time zones">
                  <div className={styles.zoneRow}>
                    <Globe className={styles.zoneIcon} aria-hidden="true" strokeWidth={1.75} />
                    <dt>
                      <span className={styles.zoneRole}>Shop</span>
                      <span className={styles.zoneCity}>Kyiv</span>
                    </dt>
                    <dd>09:00</dd>
                  </div>
                  <div className={styles.zoneRow}>
                    <MapPin className={styles.zoneIcon} aria-hidden="true" strokeWidth={1.75} />
                    <dt>
                      <span className={styles.zoneRole}>Client</span>
                      <span className={styles.zoneCity}>Warsaw</span>
                    </dt>
                    <dd>08:00</dd>
                  </div>
                  <div className={styles.zoneRow}>
                    <MapPin className={styles.zoneIcon} aria-hidden="true" strokeWidth={1.75} />
                    <dt>
                      <span className={styles.zoneRole}>Client</span>
                      <span className={styles.zoneCity}>New York</span>
                    </dt>
                    <dd>02:00</dd>
                  </div>
                </dl>
              </div>
              <div className={styles.proofText}>
                <h3 className={styles.proofTitle}>Their time zone, your opening hours.</h3>
                <p>
                  Slots are built in the shop&rsquo;s local time and shown in each client&rsquo;s own zone. The night
                  the clocks change, a 09:00 opening stays at 09:00.
                </p>
              </div>
            </article>

            <article className={styles.proof}>
              <div className={styles.proofWidget}>
                <ul className={styles.notes} aria-label="What each side receives">
                  <li className={styles.noteItem}>
                    <span className={styles.noteFrom}>
                      <Send className={styles.noteIcon} aria-hidden="true" strokeWidth={1.75} />
                      Telegram to Marta
                    </span>
                    <span className={styles.noteBubble}>New booking: Haircut, Tue 10:30</span>
                  </li>
                  <li className={styles.noteItem}>
                    <span className={styles.noteFrom}>
                      <MessageSquare className={styles.noteIcon} aria-hidden="true" strokeWidth={1.75} />
                      Client
                    </span>
                    <span className={styles.noteBubble}>northside-haircut.ics · Manage booking</span>
                  </li>
                </ul>
              </div>
              <div className={styles.proofText}>
                <h3 className={styles.proofTitle}>Everyone hears about it.</h3>
                <p>
                  Barbers get new bookings and cancellations in Telegram. Clients get a calendar file and a private
                  link to cancel or reschedule, with no account to create.
                </p>
              </div>
            </article>
          </div>
        </section>

        <div className={styles.lower}>
          <section className={styles.pricing} id="pricing" aria-labelledby="pricing-title">
            <div className={styles.pricingHeader}>
              <span className={styles.pricingAvatar} aria-hidden="true">
                <Image src="/plates/headline-photo.png" alt="" width={120} height={120} sizes="72px" />
              </span>
              <h2 id="pricing-title" className={styles.sectionTitleDark}>
                Two plans. Upgrade when the chairs fill up.
              </h2>
            </div>

            <div className={styles.priceLedger}>
              <div className={styles.ledgerLabels} aria-hidden="true">
                <div className={styles.ledgerHeadSpacer} />
                <ul className={styles.ledgerLabelRows}>
                  <li>Staff members</li>
                  <li>Services</li>
                  <li>Monthly bookings</li>
                  <li>Staff notifications</li>
                  <li>Calendar feeds</li>
                </ul>
                <div className={styles.ledgerFootLabel}>Public booking page</div>
              </div>

              <div className={`${styles.plan} ${styles.planFree}`}>
                <div className={styles.planHeadRow}>
                  <h3 className={styles.planName}>Free</h3>
                </div>
                <p className={styles.planPrice}>
                  $0 <span>forever</span>
                </p>
                <ul className={styles.planItems}>
                  <li>
                    <span>
                      <span className={styles.mobileSpecLabel}>Staff members: </span>Up to 3
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className={styles.mobileSpecLabel}>Services: </span>Up to 5
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className={styles.mobileSpecLabel}>Monthly bookings: </span>100 a month
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className={styles.mobileSpecLabel}>Staff notifications: </span>Manage links
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className={styles.mobileSpecLabel}>Calendar feeds: </span>Client .ics download
                    </span>
                  </li>
                </ul>
                <div className={styles.planFoot}>
                  <Link className={styles.planButtonQuiet} href="/sign-up">
                    Start free
                  </Link>
                </div>
              </div>

              <div className={`${styles.plan} ${styles.planPro}`}>
                <div className={styles.planHeadRow}>
                  <h3 className={styles.planName}>Pro</h3>
                  <span className={styles.planBadge}>Up to 10 chairs</span>
                </div>
                <p className={styles.planPrice}>
                  $19 <span>per month</span>
                </p>
                <ul className={styles.planItems}>
                  <li>
                    <Check className={styles.planCheck} aria-hidden="true" strokeWidth={2} />
                    <span>
                      <span className={styles.mobileSpecLabel}>Staff members: </span>Up to 10 chairs
                    </span>
                  </li>
                  <li>
                    <Check className={styles.planCheck} aria-hidden="true" strokeWidth={2} />
                    <span>
                      <span className={styles.mobileSpecLabel}>Services: </span>Unlimited
                    </span>
                  </li>
                  <li>
                    <Check className={styles.planCheck} aria-hidden="true" strokeWidth={2} />
                    <span>
                      <span className={styles.mobileSpecLabel}>Monthly bookings: </span>Unlimited
                    </span>
                  </li>
                  <li>
                    <Check className={styles.planCheck} aria-hidden="true" strokeWidth={2} />
                    <span>
                      <span className={styles.mobileSpecLabel}>Staff notifications: </span>Telegram alerts
                    </span>
                  </li>
                  <li>
                    <Check className={styles.planCheck} aria-hidden="true" strokeWidth={2} />
                    <span>
                      <span className={styles.mobileSpecLabel}>Calendar feeds: </span>Feed for every barber
                    </span>
                  </li>
                </ul>
                <div className={styles.planFoot}>
                  <Link className={styles.planButton} href="/sign-up">
                    Start with Pro
                  </Link>
                </div>
              </div>
            </div>
            <p className={styles.priceNote}>Checkout runs on Stripe in test mode in this demo. No real card is charged.</p>
          </section>

          <section className={styles.roles2} id="roles" aria-labelledby="roles-title">
            <h2 id="roles-title" className={styles.sectionTitleDark}>
              See the dashboard from every chair.
            </h2>
            <RoleSwitcher />
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
