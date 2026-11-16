# Stage 14 Deployment Runbook — Tendly

Checklist for deploying Tendly to **Vercel + hosted Supabase + Stripe Sandbox + Telegram Bot**.
Never commit real secrets or paste them into chat; set all server-only secrets directly in Vercel / `.env.local` / Supabase Vault.

## 1. Hosted Supabase Setup

1. Create a new Supabase project (`tendly-demo`, region `eu-central-1`) or link an existing dedicated project:
   ```bash
   pnpm exec supabase link --project-ref <PROJECT_REF>
   ```
2. Push all 12 migrations and seed `Northside Barbers` (`supabase/seed.sql` runs `public.reset_demo_and_expired_data()`):
   ```bash
   pnpm exec supabase db push --include-seed
   ```
3. **Authentication settings** in Supabase Dashboard → Authentication:
   - **Sign In / Providers → Email:** disable **Confirm email** (so demo visitors can register and test onboarding without email delivery, as decided in Stage 2).
   - **Attack Protection:** optionally configure live Cloudflare Turnstile keys (or leave Cloudflare's always-pass test keys during sandbox demo testing).
   - **URL Configuration:** set `Site URL` to `https://<VERCEL_DOMAIN>` and add `https://<VERCEL_DOMAIN>/**` to Redirect URLs.
   - **Signing Keys:** verify asymmetric JWT signing keys (`ES256` / JWKS) are enabled so `getClaims()` verifies tokens locally without extra Auth round-trips.
4. **Database secrets for `pg_net` Cron triggers** in Supabase Dashboard → SQL Editor (replace placeholders cleanly — never commit these values):
   ```sql
   select vault.create_secret('https://<VERCEL_DOMAIN>', 'tendly_app_url');
   select vault.create_secret('<STRONG_RANDOM_CRON_SECRET>', 'tendly_cron_secret');

   select cron.schedule(
     'tendly-drain-notifications-http',
     '*/5 * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'tendly_app_url') || '/api/cron/reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tendly_cron_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );

   select cron.schedule(
     'tendly-nightly-demo-reset-http',
     '55 2 * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'tendly_app_url') || '/api/cron/demo-reset',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tendly_cron_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   *(Running `/api/cron/demo-reset` at `02:55 UTC` cancels expired visitor Stripe subscriptions before resetting/pruning, while the built-in SQL `tendly-nightly-demo-reset` job runs cleanly at `03:00 UTC` as a fallback.)*

## 2. Vercel Environment Variables & Deploy

Configure these environment variables for **Production** (and Preview if desired) in Vercel before promoting the production build:

| Variable | Visibility | Value source |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public | `https://<VERCEL_DOMAIN>` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Hosted Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Hosted Supabase Publishable (`sb_publishable_...`) key |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public | Cloudflare Turnstile site key (`1x00000000000000000000AA` for test mode) |
| `SUPABASE_SECRET_KEY` | Server-only | Hosted Supabase Secret (`sb_secret_...`) key |
| `TURNSTILE_SECRET_KEY` | Server-only | Cloudflare Turnstile secret key (`1x0000000000000000000000000000000AA` for test mode) |
| `STRIPE_SECRET_KEY` | Server-only | Stripe **Sandbox** secret key (`sk_test_...`) |
| `STRIPE_PRO_PRICE_ID` | Server-only | Pro `$19/mo` recurring price ID (`price_...`) from `pnpm stripe:setup` |
| `STRIPE_WEBHOOK_SECRET` | Server-only | Hosted Stripe Sandbox webhook signing secret (`whsec_...`) |
| `TELEGRAM_BOT_TOKEN` | Server-only | Telegram BotFather token |
| `CRON_SECRET` | Server-only | Strong random token matching `tendly_cron_secret` in Supabase Vault |

Deploy:
```bash
pnpm check
npx -y vercel --prod --yes
```

## 3. Stripe Sandbox Webhook & Customer Portal

1. In Stripe Dashboard (**Sandbox / Test mode**, never Live):
   - Developers → Webhooks → Add endpoint:
     - Endpoint URL: `https://<VERCEL_DOMAIN>/api/webhooks/stripe`
     - Payload style: **Snapshot** (matching `constructEvent` in `/api/webhooks/stripe`)
     - Events:
       - `checkout.session.completed`
       - `customer.subscription.updated`
       - `customer.subscription.deleted`
       - `invoice.paid`
       - `invoice.payment_failed`
   - Copy the endpoint Signing secret (`whsec_...`) into Vercel `STRIPE_WEBHOOK_SECRET`, then redeploy.
2. Settings → Billing → Customer portal (in the same Sandbox): activate Customer Portal (allow plan cancellation & payment method update).

## 4. Telegram Bot Webhook

Point the bot webhook to the production deployment (optional header `secret_token` if `TELEGRAM_WEBHOOK_SECRET` is configured):
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<VERCEL_DOMAIN>/api/webhooks/telegram"}'
```

## 5. Post-Deploy Smoke Checklist

- [ ] `/` renders cleanly with zero 4xx/5xx console errors; hero `"Book"` goes to `/b/northside-barbers`
- [ ] `#roles` / `/demo/owner`, `/demo/manager`, `/demo/staff` sign in with 1 click and enforce role caps + locked demo creds/Telegram
- [ ] New visitor sign-up → onboarding creates business without email confirmation
- [ ] Stripe Sandbox Checkout (`4242...`) upgrades to Pro (`10` staff) and Customer Portal opens
- [ ] Unauthenticated `POST /api/cron/demo-reset` and `/api/cron/reminders` return `401`; authorized `Bearer $CRON_SECRET` returns `200`
