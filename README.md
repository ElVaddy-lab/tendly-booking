# Tendly — Multi-tenant Booking SaaS (Demo)

A portfolio SaaS demo for appointment-based small businesses (barbershops, salons, studios), built with **Next.js 16 (App Router + Cache Components)**, **Supabase (Postgres, Auth, RLS, pgTAP, Cron)**, and **Stripe (Test Mode Sandbox)**.

**Live demo:** https://tendly-booking.vercel.app  
**Demo booking page:** https://tendly-booking.vercel.app/b/northside-barbers  
**One-click role entry:** `/demo/owner` · `/demo/manager` · `/demo/staff`

> **Honest demo notice:** *Northside Barbers*, its barbers, services, and starter appointments are fictional. Payments run strictly in **Stripe Test Mode (Sandbox)** using test cards (`4242 ...`). In the live demo, visitor sign-up works without email confirmation, demo data resets nightly (`02:55` / `03:00 UTC`), and visitor-created businesses and accounts older than 24 hours are automatically deleted.

---

## What It Does

- **Public booking board (`/b/[slug]`)** — Customers choose a service, specialist (or *Anyone available*), date, and slot converted to their browser's local time zone, complete Turnstile + DB rate-limited booking, and receive an `.ics` calendar file plus a private `/manage/[token]` link.
- **Zero double-booking under concurrency** — Postgres computes slots on read (`available_slots()`) from recurring local `weekly_hours`, `time_off` blocks, and active bookings; concurrent requests hit a database `btree_gist` exclusion constraint (`SQLSTATE 23P01`).
- **Self-service booking management (`/manage/[token]`)** — Customers inspect appointment details without exposing PII, reschedule cleanly (even to adjacent overlapping times against their own booking via `private.available_slots_excluding`), or cancel before `cancellation_deadline_hours` to release the slot immediately.
- **Role-isolated admin workbench (`/dashboard`)** — Day and Week schedule grids by specialist, booking status transitions (`confirmed` → `completed` / `no_show` / `cancelled`), walk-in manual booking (without `min_notice` or email), two-step GDPR customer data erasure, services, split shifts, time off, and shareable team invites (`/invite/[token]`).
  - `Owner`: billing, settings, team invitations, and full shop operations.
  - `Manager`: services, all staff schedules, time off, and bookings (no billing/team invites).
  - `Staff`: own schedule, own bookings, and personal notifications only.
- **Telegram notifications & private `.ics` feeds** — Staff link Telegram chats via a one-time `/start <code>` webhook (`/api/webhooks/telegram`), outbox triggers queue booking changes and daily digests (`pg_cron` → `/api/cron/reminders`), and each specialist gets a revocable `/api/cal/[token]` calendar subscription.
- **Stripe Sandbox billing & database-enforced limits** —
  - **Free (`$0/mo`):** up to **3** active staff, **5** active services, **100** confirmed bookings/month.
  - **Pro (`$19/mo`, Sandbox):** up to **10** active staff, unlimited services and bookings.
  - Triggers enforce limits inside Postgres; upgrades/downgrades take effect only from verified Stripe webhooks (never from checkout redirect query params).

---

## Architecture

```
Browser (Desktop / Mobile)
  │
  ├── / , /b/[slug] (Cached catalog via `'use cache'` + dynamic `<Suspense>` slots)
  ├── /manage/[token], /invite/[token], /demo/[role]
  └── /dashboard (Server Components + Server Actions, role-checked per action)
         │
         ▼
Next.js 16 Proxy (`src/proxy.ts`) + App Route Handlers
  ├── /api/webhooks/stripe    (Raw signature check -> `stripe_events` dedupe -> `subscriptions.retrieve`)
  ├── /api/webhooks/telegram  (`x-telegram-bot-api-secret-token` -> `/start` code match)
  ├── /api/cal/[token]        (Hashed token lookup -> RFC 5545 `.ics` feed)
  └── /api/cron/{reminders,demo-reset}  (Bearer `CRON_SECRET` protected)
         │
         ▼
Supabase Postgres + Auth (`xuzipblvmhjfvxlbxpfi` hosted / Docker local)
  ├── Auth SSR (`@supabase/ssr`, `getClaims()`, Turnstile CAPTCHA)
  ├── RLS + `private.*` security-definer helpers + column-level `staff` grants
  ├── `btree_gist` exclusion constraint `[starts_at, blocked_until)`
  ├── Plan limit triggers + Demo immutability triggers (`auth.users`, `businesses`, `staff`)
  └── `pg_cron` + `pg_net` (Vault secrets -> nightly reset & 5-min outbox drain)
```

---

## Security Model

- **Server-verified identity in every Server Action:** `src/proxy.ts` refreshes cookies only on authenticated routes (`/dashboard`, `/onboarding`, `/sign-in`, `/sign-up`, `/invite`); public routes (`/`, `/b/*`, `/manage/*`, `/demo/*`) skip cookie sessions so cached HTML never leaks a user session. Every Server Action calls `getClaims()` and verifies tenant role membership directly in Postgres.
- **Defense-in-depth RLS & private schema:** Helper functions (`private.business_ids_with_role`, `private.own_staff_ids`) live in an unexposed `private` schema with `search_path = ''`. Anonymous callers have no table SELECT grants on `bookings`, `business_members`, or `staff` secret columns (`telegram_chat_id`, `telegram_link_code_hash`, `ics_token_hash`).
- **Hashed capability tokens:** Manage links (`/manage/[token]`), team invites (`/invite/[token]`), Telegram link codes, and `.ics` feed URLs store only SHA-256 hashes in the database.
- **Webhook & cron authenticity:** `/api/webhooks/stripe` verifies the raw request body via `stripe.webhooks.constructEvent`, deduplicates by `event.id` in `stripe_events`, and re-fetches canonical subscription state from Stripe. Cron endpoints verify `Authorization: Bearer $CRON_SECRET` with constant-time comparison (`crypto.timingSafeEqual`).
- **Demo integrity:** Built-in demo business `Northside Barbers` and its 3 auth users (`owner@demo.tendly.example`, `manager@demo.tendly.example`, `staff@demo.tendly.example`) are guarded by Postgres triggers blocking deletion, slug edits, credential updates on `auth.users`, and Telegram linking.

---

## Architecture Decision Records (ADRs)

- [ADR 001 — Time Zones and Daylight Saving Time](docs/adr/001-timezones-and-dst.md)
- [ADR 002 — Slot Computation and Double-Booking Prevention](docs/adr/002-booking-conflicts-and-slots.md)
- [ADR 003 — Stripe Billing, Webhooks, and Database Plan Limits](docs/adr/003-stripe-billing-and-limits.md)

---

## Project Layout

| Path | Purpose |
|---|---|
| `src/app/` | Next.js App Router pages, landing (`/`), `/b/[slug]`, `/manage/[token]`, `/invite/[token]`, `/demo/[role]`, `/onboarding`, `/dashboard`, and API routes |
| `src/lib/` | Pure domain helpers (`booking-slots`, `timezone`, `ics`, `manage-booking`, `stripe-billing`, `notifications`, `demo-mode`, `rate-limit`, `turnstile`) + Vitest unit tests |
| `supabase/migrations/` | 12 ordered SQL migrations (`20261115100000_core_schema.sql` … `20261115101100_demo_and_reset.sql`) + `supabase/seed.sql` |
| `supabase/tests/database/` | 13 pgTAP test suites verifying RLS, slots, DST boundaries, exclusion constraints, billing triggers, and demo reset |
| `tests/e2e/` | Playwright + `@axe-core/playwright` E2E specs (desktop & mobile viewports, two-tab race, Stripe webhooks, demo restrictions) |
| `scripts/stripe-setup.mjs` | Idempotent script to create the Tendly Pro `$19/mo` product/price in Stripe Sandbox |
| `docs/adr/` | Architecture Decision Records |
| `case/` | Case study (`case/case.md`), video walkthrough script (`case/video-script.md`), and local captures in `case/media/` (gitignored) |

---

## Run Locally (with Stripe CLI)

### Prerequisites

- **Node.js** `>= 22.22.2 < 25` and **pnpm** `10.33.4`
- **Docker** (for the local Supabase stack)
- **Stripe CLI** (for forwarding local webhook events in test mode)

### 1. Install dependencies and start local Supabase

```bash
pnpm install
pnpm supabase:start
pnpm db:reset
```

Inspect the local API URL and keys:

```bash
pnpm exec supabase status
```

### 2. Configure `.env.local`

Copy `.env.example` to `.env.local` and fill in the local Supabase values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`).

```bash
cp .env.example .env.local
```

Cloudflare Turnstile test keys in `.env.example` (`1x00000000000000000000AA`) pass automatically in local development.

### 3. Connect Stripe Sandbox (optional for local billing flows)

Add your Stripe **Sandbox / Test Mode** secret key (`STRIPE_SECRET_KEY=sk_test_...`) to `.env.local`, then create the Pro `$19/mo` price:

```bash
pnpm stripe:setup
```

Copy the printed `STRIPE_PRO_PRICE_ID` (`price_...`) into `.env.local`. Then start local webhook forwarding in a separate terminal:

```bash
stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to http://localhost:3000/api/webhooks/stripe
```

Copy the printed `whsec_...` signing secret into `.env.local` as `STRIPE_WEBHOOK_SECRET`.

### 4. Start the app

```bash
pnpm dev
```

Open http://localhost:3000 (or http://localhost:3000/b/northside-barbers).

---

## Scripts & Verification

| Command | What it runs |
|---|---|
| `pnpm dev` | Next.js development server |
| `pnpm check` | `eslint .` + `next typegen && tsc --noEmit` + Vitest + `next build` |
| `pnpm test:run` | Unit tests (Vitest) |
| `pnpm test:db` | Database & RLS tests (pgTAP — run `pnpm db:reset` cleanly after E2E) |
| `pnpm test:e2e` | End-to-end & accessibility tests (Playwright + axe-core against `next build && next start`) |
| `pnpm exec supabase db lint` | Schema and PL/pgSQL linter |
| `pnpm types:generate` | Regenerates `src/types/database.generated.ts` from local Postgres |

### Measured Quality

- **Database (pgTAP):** 13 test suites, **278 assertions passing** (`supabase db lint` reports 0 errors).
- **Unit tests (Vitest):** 14 files, **105 tests passing** (including DST boundaries, slot math, `.ics` generation, webhook verification, demo helpers).
- **End-to-end & Accessibility (Playwright + axe-core):** **30 passing tests** across Chromium desktop and mobile (`390×844`), including simultaneous two-tab race via `Promise.all`, `America/New_York` DST visitor conversions, Stripe webhook simulation, and **0 WCAG 2.2 AA violations** on audited pages.
- **Lighthouse 13.6 (`/` landing, Stage 12 build):** Mobile Performance `99`, Accessibility `100`, Best Practices `100`, SEO `100`; Desktop Performance `100`, Accessibility `100`, SEO `100`.

---

## Known Limitations

- **No customer emails in MVP:** Built-in Supabase email is restricted in sandbox setups, so open visitor sign-up runs with email confirmation disabled, no password reset exists, and visitor workspaces expire after 24 hours. Staff alerts use Telegram and `.ics` feeds.
- **Stripe Test Mode only:** Billing uses Stripe Sandbox; no real payments, payouts, or client deposits (`Stripe Connect` is out of scope for the MVP).
- **Browser JavaScript required:** Interactive slot selection, Turnstile widgets, and the Day/Week schedule grid require client-side JavaScript.
