# Stage 12 — Manual Verification Checklist (Stripe Sandbox, Telegram & DST)

## 1. Prerequisites in `.env.local`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_PRO_PRICE_ID=price_...` (verified via `pnpm stripe:setup`, `$19.00/month` USD)
- `STRIPE_WEBHOOK_SECRET=whsec_...` (from `stripe listen`)
- `TELEGRAM_BOT_TOKEN=...` (`@tendly_site_bot`)

Run Stripe webhook listener in a separate terminal:
```powershell
stripe listen --events checkout.session.completed,invoice.paid,invoice.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to http://localhost:3000/api/webhooks/stripe
```

## 2. Stripe Sandbox Checkout & Portal Checklist
1. Sign up as an owner and complete `/onboarding` -> lands on `/dashboard` on **Free plan — $0/mo**.
2. Add 2 more staff (3 total), verify 4th is blocked by `plan_limit_staff`.
3. Click **Upgrade to Pro — $19/mo** -> opens `checkout.stripe.com`.
4. Verify **no-bypass guard**: manually open `/dashboard?billing=success#billing` without completing payment -> plan MUST remain **Free**.
5. Complete Checkout with test card `4242 4242 4242 4242` (future expiry, any 3-digit CVC):
   - Verify `stripe listen` logs `200 OK` on `POST /api/webhooks/stripe`.
   - Verify `/dashboard#billing` shows **Pro plan — $19/mo**, 4th staff member succeeds, and **Manage billing** appears.
6. Test **decline scenario** with `4000 0000 0000 0002` (or trigger `stripe trigger invoice.payment_failed`) -> verify status surfaces `Past due` and restores Free limits until paid.
7. Click **Manage billing** -> opens Stripe Customer Portal -> cancel subscription -> verify `customer.subscription.deleted` restores Free plan limits (`3 staff / 5 services / 100 bookings`).

## 3. Telegram Notification & `.ics` Feed Checklist
1. Open a staff card -> **Telegram & calendar (.ics)** -> **Connect Telegram** (`/start <code>`).
2. Send `/start <code>` to `@tendly_site_bot` (against deployed URL or HTTPS tunnel webhook) -> verify reply & `"Telegram linked"`.
3. Book an appointment for that staff member via `/b/<slug>` and drain `/api/cron/reminders` -> confirm Telegram message arrives in chat.
4. Enable `.ics` feed, subscribe/fetch `/api/cal/<token>`, then click **Revoke .ics** -> confirm `/api/cal/<token>` immediately returns `404`.

## 4. DST Spot Check (`Europe/Kyiv` & `America/New_York`)
- Verified automatically across pgTAP (`030_slots.test.sql`), Vitest (`timezone.test.ts`, `booking-slots.test.ts`), and Playwright (`concurrency-and-dst.spec.ts`).
- When booking from a non-shop timezone on `/b/<slug>`, confirm each slot shows both the visitor's local clock and `Shop time (...)`.
