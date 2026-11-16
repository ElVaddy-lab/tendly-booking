# Stage 16 — Portfolio & Marketplace Packaging (Tendly)

Ready-to-publish copy and visual assets for **Upwork**, **Freelancehunt**, and **vadymdev**.
Visual assets live in `case/media/`; the marketplace banners below stay local (gitignored), only the case screenshots are committed:
- Upwork gallery (4:3, `2000×1500`): `upwork-01-cover.png`, `upwork-02-booking-and-dst.png`, `upwork-03-calendar-and-roles.png`, `upwork-04-billing-and-proof.png`
- Freelancehunt single showcase image (`1600×1200`): `freelancehunt-cover.png`
- `vadymdev` base screenshots: `home.png`, `home-mobile.png`, `booking.png`, `booking-mobile.png`, `dashboard-owner.png`

---

## 1. Upwork Portfolio Item (React / Next.js Specialized Profile)

- **Project Title:** `Tendly — Multi-tenant Booking SaaS (Next.js 16 + Supabase + Stripe)`
- **Role:** `Full-Stack Next.js, Postgres & Stripe Developer`
- **Live URL:** `https://tendly-booking.vercel.app`
- **Demo Booking Page:** `https://tendly-booking.vercel.app/b/northside-barbers`
- **Source Code:** `https://github.com/ElVaddy-lab/tendly-booking`
- **Skills / Tags:** `Next.js`, `React`, `TypeScript`, `PostgreSQL`, `Supabase`, `Stripe`, `Playwright`, `Tailwind CSS`

### Portfolio Description (English)
```text
Tendly is a multi-tenant appointment booking SaaS built on Next.js 16 (App Router, Cache Components), Supabase (Postgres, Auth SSR, RLS, pgTAP, Cron), and Stripe (Test Mode Sandbox).

It demonstrates production solutions to the hardest edge cases in online booking MVPs:

• Time zones & DST without drift: each business owns an IANA time zone (e.g. Europe/Kyiv, America/New_York); recurring weekly_hours stay in local wall-clock time while appointments persist as UTC timestamptz and render in the visitor's detected browser zone.
• Double-booking impossible under concurrency: slots are computed on read by Postgres available_slots(), and confirmed appointments carry an explicit blocked_until timestamp protected by a btree_gist exclusion constraint ([starts_at, blocked_until) where status = 'confirmed'). Simultaneous browser submissions hit SQLSTATE 23P01 and cleanly refuse the second tab.
• Self-service manage links: visitors receive a perforated confirmation ticket, an .ics download, and a SHA-256-hashed /manage/[token] link to reschedule (using available_slots_excluding for contiguous moves) or cancel before the shop's deadline.
• Role-isolated admin workbench: one-click demo login for Owner, Manager, and Staff enforced by Postgres RLS helpers in a private schema, Day/Week staff calendar, walk-in manual booking, GDPR customer data erasure, Telegram /start webhook alerts drained by pg_cron, and revocable per-staff .ics feeds.
• Stripe Sandbox & DB-enforced plans: Free (3 staff, 5 services, 100 bookings/mo) and Pro ($19/mo, 10 staff, unlimited services/bookings). Plan changes happen only via signature-verified Stripe webhooks with idempotent event logging and canonical subscription re-fetch — enforced inside Postgres triggers, not only React UI.

Verification: 278 pgTAP database assertions (0 db lint errors), 105 Vitest unit tests, and 30 Playwright + axe-core WCAG 2.2 AA end-to-end checks (including live two-tab concurrency and Stripe webhook flows). Lighthouse 13.6 via PageSpeed Insights on the live `/` (2026-11-16): Mobile 99 Performance / 100 Accessibility / 100 Best Practices / 100 SEO; Desktop 100 / 100 / 100 / 100.

Honest demo disclosure: Northside Barbers, its staff, and starter bookings are fictional, payments run strictly in Stripe Test Mode (card 4242...), demo accounts reset nightly, and visitor workspaces created via open sign-up are removed after 24 hours.
```

---

## 2. Upwork Project Catalog — «Booking MVP on Next.js + Supabase»

### Overview
- **Title (after "You will get"):** `a production-ready SaaS booking MVP with Next.js, Supabase, and Stripe`
- **Category:** `Web Development` → `Full Stack Development`
- **Search Tags:** `Next.js`, `Supabase`, `Stripe Subscriptions`, `PostgreSQL`, `TypeScript`

### Pricing Tiers (`title <= 30 chars`, `description <= 80 chars`)

| Field | Starter | Standard | Advanced |
|---|---|---|---|
| **Title** | `Single-shop booking page` | `Multi-staff booking + admin` | `Full SaaS MVP + Stripe` |
| **Description** | `Public booking flow, DST-safe slots, exclusion lock, and .ics confirmation.` | `Owner/Staff roles, Day/Week calendar, weekly shifts, time off, manage links.` | `Multi-tenant RLS, Stripe subscriptions with DB quotas, invites & tests.` |
| **Delivery (days)** | `5` | `10` | `16` |
| **Revisions** | `1` | `2` | `2` |
| **Price** | `$450` | `$950` | `$1,800` |

### Gallery
1. `case/media/upwork-01-cover.png`
2. `case/media/upwork-02-booking-and-dst.png`
3. `case/media/upwork-03-calendar-and-roles.png`
4. `case/media/upwork-04-billing-and-proof.png`

### Requirements (sent to client after order)
1. *(Required)* `What type of service business are you building for (e.g., barbershop, salon, clinic, coaching), and does it support single or multiple locations/specialists?`
2. *(Required)* `Do bookings require free scheduling only, paid Stripe subscriptions for businesses (SaaS), or upfront client payments?`
3. `Which notification channels do you need at launch (calendar .ics files, Telegram bot, or transactional email via your domain)?`
4. `Do you have an existing brand guide/Figma, or should we adapt a clean, accessible design system from scratch?`

### Steps
1. `Architecture & Schema` — `I finalize tenant roles, time-zone rules, and Postgres RLS/slot tables before building UI.`
2. `Core Booking & Admin` — `I implement the public booking flow, concurrency exclusion constraints, manage links, and calendar dashboard.`
3. `Billing, Notifications & QA` — `I wire Stripe webhooks and plan quotas, verify accessibility with Playwright + axe-core, and deploy to Vercel + Supabase.`

### Full Project Description (English)
```text
Need an online booking MVP that won't break on Daylight Saving Time shifts, overlapping tabs, or bypassed plan limits?

I build production booking web apps with Next.js (App Router), TypeScript, Supabase Postgres + Auth + RLS, and Stripe Billing — engineered so every critical rule is enforced by the database, not fragile client code.

What's included across tiers:
- Customer booking page (`/b/[slug]`): service → specialist (or "Anyone available") → date → time slots converted to the visitor's local time zone, confirmation ticket + `.ics` download.
- Zero double-booking guarantee: Postgres `available_slots()` calculation + `btree_gist` exclusion constraint prevents race conditions under concurrent requests.
- Private self-service `/manage/[token]`: SHA-256 hashed tokens let customers reschedule or cancel before your deadline without creating an account.
- Role-based dashboard (`/dashboard`): Owner / Manager / Staff isolation via Row Level Security, Day & Week schedule grids, split shifts, time off, walk-in creation, team invite links, and GDPR client data erasure.
- Stripe Billing + quotas: Checkout, Customer Portal, signature-verified webhook sync, and database triggers enforcing plan limits.
- Optional Telegram staff alerts + `.ics` calendar feeds scheduled cleanly via Supabase Cron.

Live architecture proof: https://tendly-booking.vercel.app (fictional Northside Barbers demo running on Vercel + Supabase + Stripe Test Mode, covered by 278 pgTAP, 105 Vitest, and 30 Playwright + axe checks).

Not included unless scoped separately: mobile native apps, custom email SMTP domain setup, or real payment KYC/onboarding.
```

### FAQ (5 items)
1. **`How do you prevent two customers from booking the same slot at once?`** — `Availability is enforced inside PostgreSQL with a btree_gist exclusion constraint over [starts_at, blocked_until) per specialist. Even simultaneous browser submissions commit cleanly for one visitor and show a friendly conflict message to the other.`
2. **`How are different time zones and DST handled?`** — `Each business stores its authoritative IANA time zone (e.g. America/New_York or Europe/Kyiv), recurring shifts stay local, and confirmed bookings store UTC timestamps converted cleanly into each visitor's browser time zone.`
3. **`Can team members have limited access to the admin dashboard?`** — `Yes. Owner, Manager, and Staff roles are verified on the server and enforced by Supabase Row Level Security policies and column-level grants, so Staff members only access their own schedule and bookings.`
4. **`How do you keep Stripe subscription upgrades secure?`** — `Plan state never relies on checkout redirect URLs or client state. Only verified Stripe webhooks (raw body signature + event deduplication + canonical subscription lookup) update plan status, while Postgres triggers enforce limits.`
5. **`Will I receive full source code and automated tests?`** — `Yes. Every milestone ships cleanly typed TypeScript, SQL migrations, pgTAP database tests, Vitest unit tests, Playwright E2E + axe accessibility checks, and deployment documentation.`

---

## 3. Freelancehunt Portfolio Case (Одне зображення: `case/media/freelancehunt-cover.png`)

- **Назва роботи:** `Tendly — SaaS онлайн-бронювання (Next.js 16, Supabase RLS, Stripe)`
- **Посилання на демо:** `https://tendly-booking.vercel.app`
- **Код:** `https://github.com/ElVaddy-lab/tendly-booking`
- **Теги:** `Next.js`, `React`, `TypeScript`, `PostgreSQL`, `Supabase`, `Stripe`, `Playwright`

### Опис для Freelancehunt (Українською)
```text
Розробив повноцінний демо-SaaS онлайн-бронювання для малого сервісного бізнесу (барбершопи, салони, студії) на Next.js 16 (App Router, Cache Components), Supabase Postgres / Auth / RLS і Stripe (Test Mode Sandbox).

Що реалізовано під капотом:
• Публічний запис `/b/[slug]`: вибір послуги, майстра («будь-хто вільний» або конкретний), дати й слота з автоматичним перерахунком у часовий пояс відвідувача та захистом від переходів DST (Europe/Kyiv, America/New_York).
• Неможливість подвійного бронювання: слоти генеруються на льоту функцією Postgres `available_slots()`, а кожен підтверджений запис із буфером (`blocked_until`) захищений `btree_gist` exclusion constraint — при одночасному кліку в двох вкладках БД пропускає рівно один запис.
• Керування записом `/manage/[token]`: перегляд деталей без розкриття персональних даних, `.ics`-квиток, скасування та перенесення до дедлайну (через SHA-256 токен у БД).
• Адмінка `/dashboard` за ролями (`Owner / Manager / Staff` в 1 клік): календар день/тиждень по працівниках, змінні години й `time off`, ручний запис, двокрокове GDPR-видалення ПД клієнта, інвайти команди.
• Сповіщення й білінг: Telegram-бот (`/api/webhooks/telegram`), фонова черга `notification_outbox` + Supabase `pg_cron`/`pg_net`, `.ics`-підписка майстра (`/api/cal/[token]`), Stripe Checkout + Customer Portal із підписаним вебхуком і тригерами тарифних лімітів (Free 3/5/100 і Pro 10/∞/∞) у Postgres.

Перевірки й якість: 278 pgTAP-тестів бази даних (`supabase db lint` без помилок), 105 Vitest unit-тестів, 30 Playwright E2E + axe-core WCAG 2.2 AA тестів (десктоп і мобільний, включно з одночасною гонкою двох вкладок).

Примітка: бізнес Northside Barbers, майстри та записи вигадані; оплата працює лише в тестовому режимі Stripe Sandbox (картка 4242...), а демо автоматично скидається щоночі.
```

---

## 4. `vadymdev` (`My-Site/src/content/projects.ts`) Entry

```ts
  {
    id: "tendly",
    slug: "tendly",
    exhibitCode: "EXHIBIT G",
    status: "published",
    kind: "concept",
    featured: true,
    sortOrder: 0,
    role: "Full-stack development",
    yearLabel: "2026",
    technologies: ["Next.js", "TypeScript", "Supabase", "PostgreSQL", "Stripe", "Playwright"],
    translations: [
      {
        projectId: "tendly",
        locale: "en",
        title: "Tendly",
        eyebrow: "A multi-tenant booking SaaS for barbershops and studios",
        summary:
          "An appointment booking platform where Postgres enforces time-zone and DST math, concurrency exclusion constraints, role-based Row Level Security, and Stripe subscription limits.",
        problem:
          "Many Next.js and Supabase booking MVPs rely on client-side slot checks and redirect-based billing updates, leading to double bookings under parallel tabs, DST clock drift, and weak tenant isolation.",
        contribution:
          "I designed and built the Postgres schema, RLS policies, dynamic slot engine, public booking board, customer manage-by-token flow, role-isolated admin calendar, Telegram/Cron notifications, Stripe Sandbox webhook pipeline, and automated test suites.",
        implementation:
          "Built with Next.js 16 (App Router, Cache Components), TypeScript, and Supabase. Slots are calculated on read in the shop's IANA time zone; confirmed bookings store an explicit blocked_until timestamp protected by a btree_gist exclusion constraint. Plan tiers, Telegram links, and nightly demo resets run via Postgres triggers, pg_cron, and verified webhooks.",
        outcome:
          "This is a portfolio concept project with a fictional barbershop (Northside Barbers) running in Stripe Test Mode. It is verified by 278 pgTAP database checks, 105 Vitest unit tests, and 30 Playwright + axe WCAG 2.2 AA end-to-end checks.",
        metaTitle: "Tendly — Booking SaaS case study | Vadym Shvalikovskyi",
        metaDescription:
          "Case study of Tendly, a Next.js, Supabase, and Stripe multi-tenant booking demo with Postgres exclusion constraints, DST handling, and role-based RLS.",
      },
      {
        projectId: "tendly",
        locale: "uk",
        title: "Tendly",
        eyebrow: "Мультитенантний SaaS онлайн-запису для барбершопів і студій",
        summary:
          "Платформа онлайн-бронювання, де Postgres безпосередньо забезпечує математику часових поясів і DST, захист від перетину слотів, ролеву RLS-ізоляцію та тарифні ліміти Stripe.",
        problem:
          "Типові MVP бронювання на Next.js і Supabase покладаються на перевірки в інтерфейсі та апгрейд тарифу по редіректу, що дає подвійні записи при паралельних кліках, зсуви на DST і прогалини в правах.",
        contribution:
          "Я спроєктував і реалізував схему Postgres, RLS-політики, генератор слотів, публічну дошку запису, самостійне керування за токеном, адмінку з календарем за ролями, Telegram/Cron-сповіщення, вебхук-пайплайн Stripe Sandbox і набір автотестів.",
        implementation:
          "Побудовано на Next.js 16 (App Router, Cache Components), TypeScript і Supabase. Слоти обчислюються на читанні в IANA-поясі закладу; підтверджені записи зберігають blocked_until під btree_gist exclusion constraint. Ліміти тарифів, демо-обмеження й нічне скидання працюють через тригери Postgres, pg_cron та підписані вебхуки.",
        outcome:
          "Це портфоліо-демо з вигаданим барбершопом Northside Barbers і тестовим режимом Stripe (sandbox). Проєкт перевірено 278 тестами pgTAP, 105 unit-тестами Vitest і 30 Playwright + axe WCAG 2.2 AA E2E-тестами.",
        metaTitle: "Tendly — кейс SaaS онлайн-бронювання | Vadym Shvalikovskyi",
        metaDescription:
          "Кейс Tendly: мультитенантне демо бронювання на Next.js, Supabase і Stripe із захистом від перетинів у Postgres, підтримкою DST та ролями Owner/Manager/Staff.",
      },
    ],
  },
```
