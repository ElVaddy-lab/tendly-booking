# ADR 003 — Stripe Billing, Webhooks, and Database Plan Limits

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

In multi-tenant SaaS demos, treating `?billing=success` redirects or client flags as a plan upgrade is trivially spoofable. Enforcing Free/Pro caps only in React forms or Server Actions also leaves direct Data API / SQL writes unprotected.

## Decision

1. **Stripe-hosted Checkout & Customer Portal (Sandbox only):** Only `owner` members may initiate `createCheckoutSessionAction` or `createBillingPortalSessionAction`. Checkout attaches `business_id` in session/subscription metadata; Customer Portal attaches existing `stripe_customer_id`.
2. **Webhook-only state transitions:** Redirect URLs (`?billing=success`) never mutate `business_subscriptions`. Only `/api/webhooks/stripe` updates subscription status after:
   - Reading the raw request text and verifying the signature via `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`.
   - Deduplicating by Stripe `event.id` inside `public.stripe_events`.
   - Re-fetching canonical subscription state from Stripe (`stripe.subscriptions.retrieve(...)`) so out-of-order webhook delivery never downgrades newer state.
3. **Database-enforced quotas:** Postgres triggers on `staff`, `services`, and `bookings` inspect `public.business_subscriptions` and enforce:
   - **Free:** 3 active staff, 5 active services, 100 confirmed bookings per calendar month (counted in the business's IANA time zone).
   - **Pro:** 10 active staff, unlimited services and bookings.
   - Downgrading with >3 active staff preserves existing records cleanly (no destructive cascade) while blocking activating/adding new staff until usage drops below the Free cap.
4. **Sandbox hygiene in nightly demo reset:** `/api/cron/demo-reset` cancels any test Stripe subscriptions attached to the shared demo business or visitor businesses older than 24 hours before `reset_demo_and_expired_data()` restores `Northside Barbers` to Free (`3/5`).

## Consequences

- UI redirects can never elevate privileges; tampering fails at both webhook signature verification and Postgres trigger checks (`supabase/tests/database/110_billing_and_limits.test.sql` and `tests/e2e/billing-and-limits.spec.ts`).
- `Northside Barbers` always restarts each day cleanly on the Free plan at capacity (`3/3` staff, `5/5` services) ready for evaluators to test plan limit enforcement or test-card upgrades.
