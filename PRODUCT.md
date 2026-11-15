# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Business owners and their teams** (Owner, Manager, Staff) at small appointment-based service businesses — barbershops, salons, studios. They set up services, staff schedules and time off, watch the day's calendar, change booking statuses, and manage the subscription. Mostly desktop for setup, phone for a quick look at the day.
- **Customers of those businesses**, without an account. They open a business's public page, usually on a phone, pick a service, a staff member (or "anyone"), a day and a time in their own time zone, leave a name and email, and get a confirmation, an `.ics` file and a private manage link to cancel or reschedule.
- **Evaluators of the demo**: prospective clients on Upwork and Freelancehunt who judge whether Vadym can build a correct, production-grade booking MVP on Next.js + Supabase + Stripe. They watch a short video, open the landing page, try the role-based demo, and look at the code.

## Product Purpose

Tendly is online booking for small service businesses: a public booking page per business, staff schedules, slots computed by Postgres across time zones and DST, double booking made impossible at the database level, role-based admin, and a Free → Pro subscription through Stripe. It exists as a portfolio demo that proves the hard parts of the most common "booking MVP on Next.js + Supabase" request are done right. Success: an evaluator understands within seconds what it is, books a slot, sees the race between two tabs refused, and switches roles in the admin.

## Positioning

The booking logic is enforced by the database, not the UI: slots are generated in the business's local time so DST never shifts them, an exclusion constraint makes double booking impossible even under concurrent requests, permissions are Row Level Security, and plan state comes only from Stripe webhooks. The demo lets anyone verify this directly: book the same slot from two tabs, or explore as Owner, Manager or Staff in one click.

## Operating Context

- Public page `/b/[slug]` per business; manage link `/manage/[token]` for customers; admin `/dashboard` for members; landing page at `/` with "Explore as Owner / Manager / Staff" demo entry.
- The demo business is a fictional barbershop with 3 barbers and 5 services, labelled "Demo business — fictional", reset nightly.
- Open sign-up in the deployed demo without email confirmation; visitor accounts and businesses are deleted after 24 hours; no password reset (no email).
- Staff notifications go to Telegram; customers get a confirmation page, an `.ics` file and the manage link — no email in the MVP.
- Payments are Stripe sandbox (test mode, card 4242).

## Capabilities and Constraints

- Stack in place: Next.js 16.4 (App Router, Cache Components), Tailwind CSS 4, shadcn/ui (Radix), Supabase (Auth, Postgres, RLS, Cron), Stripe Checkout + Customer Portal, Vercel.
- Plans: Free — up to 3 staff, 5 services, 100 bookings / month; Pro — $19 / month, up to 10 staff, unlimited services and bookings, Telegram notifications, `.ics` calendar feed.
- Each business has an IANA time zone; customers see times in their own zone.
- **Business branding:** the public booking page carries the business's own brand (logo and accent colour) on top of Tendly's framework; the admin and landing page are Tendly's own.
- English only (target market: Upwork). No AI features. No customer prepayment (Stripe Connect is a later option).
- Undecided: logo for Tendly; whether businesses can upload a cover photo.

## Brand Commitments

- Name: **Tendly**. No logo or visual identity exists yet.
- Honesty: every business, staff member and booking in the demo is fictional and labelled so; no invented metrics, testimonials, customers or logos.
- No personal contacts of the author anywhere in the app.

## Evidence on Hand

- Working database core: schema, RLS, `available_slots()`, `create_booking()` with 93 pgTAP checks (including Kyiv and New York DST days).
- No real customers, testimonials, usage numbers or press — none may be invented. Case-study numbers must be measured (Lighthouse via PageSpeed Insights, test counts).
- No photography yet; any demo imagery must be authored or licensed and labelled where it could be mistaken for real.

## Product Principles

1. **Correctness is the feature.** Time zones, conflicts, permissions and billing are visibly right, and the demo invites people to check.
2. **The customer path is three taps from a phone.** Service, time, details — nothing else in the way.
3. **The business owns its page.** Tendly frames the booking; the barbershop's brand is what the customer sees.
4. **Honest demo.** Everything fictional is labelled; nothing claimed that is not built or measured.

## Accessibility & Inclusion

WCAG 2.2 AA on the public booking page and key admin screens: keyboard date and slot selection (radiogroup / roving tabindex), loading and errors announced via `aria-live`, targets ≥ 24×24 px, visible focus, contrast, `prefers-reduced-motion`. Checked with axe and by hand.
