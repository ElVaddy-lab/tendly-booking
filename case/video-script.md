# Tendly — 5-Minute Walkthrough Video Script & Shot List

Target length: **4:30 – 4:50** (strictly under 5 minutes, English narration, 1080p desktop browser + terminal/code split where noted, zero personal contact details shown).

## Setup Before Recording

- Browser profile cleanly logged out at `https://tendly-booking.vercel.app`.
- Second side-by-side browser window (or incognito tab) ready at `https://tendly-booking.vercel.app/b/northside-barbers` for the live two-tab concurrency shot.
- Optional terminal tab with `stripe listen ...` (only if demonstrating webhook delivery live; ensure no secret keys are echoed).

---

## Timeline & Script

### 0:00 – 0:45 · Hook & Landing Page (`/`)
- **Shot:** Open `https://tendly-booking.vercel.app`, slow hover over the interactive booking card in the hero, scroll past the two-tab race preview to `#roles`.
- **Voiceover:**  
  "Most booking MVPs look clean in a UI mockup and break on the first real edge case: double bookings under concurrent clicks, DST shifts across time zones, spoofed plan upgrades, and permissive queries. **Tendly** is a multi-tenant booking SaaS built on Next.js 16, Supabase Postgres, and Stripe Test Mode where every critical invariant is enforced inside Postgres — and you can test every edge case yourself on the live fictional shop, *Northside Barbers*."

### 0:45 – 1:45 · Concurrent Double-Booking Proof (`/b/northside-barbers`)
- **Shot:** Open two browser windows side by side on `https://tendly-booking.vercel.app/b/northside-barbers`. In both, choose **Haircut → Andriy → tomorrow → 10:30**, fill two different names, and click **Confirm booking** nearly simultaneously.
- **Voiceover:**  
  "Slots aren't pre-stored in a table — Postgres computes them on read from the barber's local schedule, time off, and existing bookings. Under the hood, every confirmed booking writes an explicit UTC `blocked_until` timestamp and sits inside a `btree_gist` exclusion constraint over `[starts_at, blocked_until)`. When both tabs request the exact same barber and time slot at once, the database commits one winner, blocks the second request cleanly with `SQLSTATE 23P01`, and shows 'That slot was just taken' without leaking conflicting bookings."

### 1:45 – 2:30 · Time Zones, DST & Self-Service Manage Link (`/manage/[token]`)
- **Shot:** Point to the visitor timezone banner on `/b/northside-barbers` (mentioning DevTools Sensors override to `America/New_York` or `Europe/Kyiv`), download the `.ics` file from the confirmation ticket, open the `/manage/[token]` link, reschedule by 15 minutes (showing contiguous slots work), then cancel to release the slot.
- **Voiceover:**  
  "Schedules live in the business's IANA time zone while appointments stay in UTC, so Daylight Saving Time transitions in Kyiv or New York never drift a `09:00` shift. Customers don't need an account: they get an `.ics` download and a private manage link whose SHA-256 hash is stored in Postgres. Rescheduling uses `available_slots_excluding` so the customer's own booking doesn't block adjacent time slots, and cancelling before the shop's deadline returns the slot immediately."

### 2:30 – 3:35 · Role Isolation (`Owner`, `Manager`, `Staff`) & Notifications
- **Shot:** Go back to `/`, click **Enter demo as Staff** (`Sam`), show that team invites, billing upgrades, and other barbers' calendars/Telegram toggles are hidden. Switch to `/demo/owner`, show the Day/Week schedule grid, manual walk-in creation, two-step GDPR client data erasure, and Andriy's `.ics` feed controls (noting Telegram link intentionally locked in shared demo mode).
- **Voiceover:**  
  "Demo mode lets you switch roles in one click. As *Staff*, Sam sees only his own chair, schedule, and calendar integration — backed by Postgres RLS helper functions in a private schema, not just hidden buttons. As *Owner*, you see all specialists in the Day and Week grid, log walk-ins without requiring an email, erase a client's personal details cleanly, and subscribe specialists to live Telegram alerts or private `.ics` feeds drained by Supabase Cron."

### 3:35 – 4:25 · Stripe Sandbox Billing & Database Quotas
- **Shot:** Scroll to **Plan & billing** on the Owner dashboard (`3 / 3` active staff, `5 / 5` services on Free), try adding a 4th staff member to show the Postgres trigger error, click **Upgrade to Pro — $19/mo**, complete Stripe Test Mode Checkout with card `4242 ...`, return to `/dashboard`, and show Pro unlocked + **Manage billing** Customer Portal button.
- **Voiceover:**  
  "Shared *Northside Barbers* starts on the Free plan at max capacity: 3 staff and 5 services. Adding a fourth specialist is rejected by a database trigger, not just client validation. Upgrading goes through Stripe-hosted Checkout in test mode — the redirect query parameter never changes the plan on its own. Only `/api/webhooks/stripe` verifies the raw signature, deduplicates the `event.id`, re-fetches the canonical subscription from Stripe, and updates Postgres to unlock 10 staff and Customer Portal."

### 4:25 – 4:50 · Verification Summary & Wrap-up
- **Shot:** Show README / repo structure briefly and test output highlights (`278 pgTAP`, `105 Vitest`, `30 Playwright + axe`).
- **Voiceover:**  
  "Everything in the repository is verified by 278 database-level pgTAP assertions, 105 Vitest unit tests, and 30 Playwright desktop and mobile E2E tests with axe WCAG 2.2 AA checks. Links to the live demo, ADRs, and full local setup with Stripe CLI are in the README. Thanks for watching."
