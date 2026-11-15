# Етап 2 — звірка з документацією (2026-11-15)

Мета: знайти розбіжності між `PLAN.md` і актуальною документацією до написання коду. Нижче — лише те, що змінює або уточнює план.

## Версії (npm, 2026-11-15)

| Пакет | Версія |
|---|---|
| `next` | 16.4.6 (2026-11-09), лінія 16 — Active LTS |
| `@supabase/ssr` | 0.12.7 |
| `@supabase/supabase-js` | 2.119.0 |
| `stripe` (Node) | 23.1.0 |
| `supabase` (CLI) | 3.1.0 |

## Next.js

1. **Security release — уточнення.** Виправлення листопадового релізу (7 вразливостей, одна High — cross-tenant cache disclosure, GHSA-mfr8-8qww-v76h) вийшли в **16.4.5** (2026-11-03), а не в 16.4.6. Вимога «≥ 16.4.6» лишається (це просто остання версія), але причину в плані виправлено.
2. **Cache Components увімкнені за замовчуванням** у `create-next-app` (`cacheComponents: true`, `partialPrefetching: true`). Більшість листопадових вразливостей — саме в `use cache`. Правила для Tendly:
   - **Ніколи не використовувати `unstable_cache`** (High-вразливість — комбінація з `use cache`).
   - Не вкладати `use cache`-функції, що читають root params; бізнес передавати **явним рядковим аргументом** (`businessId` / `slug`), не бінарними даними.
   - Кешувати лише публічні дані бізнесу (назва, послуги, персонал) з `cacheLife` + `cacheTag('business:<id>')`; після змін в адмінці — `updateTag` / `revalidateTag`.
   - **Слоти, записи й усе з персональними даними — не кешувати**: динамічно, за `<Suspense>`.
   - `use cache` на serverless за замовчуванням живе в пам'яті інстансу — не розраховувати на нього як на спільний кеш.
3. **`proxy.ts`**: замінює `middleware.ts` з v16, завжди Node.js runtime (опцію `runtime` задати не можна). Документація прямо каже: **перевіряти авторизацію в кожній Server Action**, а не покладатися на Proxy — matcher або перенесення Action може тихо зняти захист.

## Supabase

4. **SSR / Auth.** Змінні: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `getClaims()` — для захисту сторінок і даних (з асиметричними ключами підпису перевіряє JWT локально, інакше — запит до Auth). `getSession()` на сервері для авторизації — ні. Proxy має повертати саме `supabaseResponse` (або копіювати cookies і заголовки `cache-control`, `expires`, `pragma`).
   - **Наслідок для Tendly:** відповідь із `Set-Cookie` не можна віддати зі спільного кешу — інакше сесія одного користувача може потрапити іншому. Тому **публічні маршрути (`/b/*`, `/manage/*`, лендинг) виключити з matcher Proxy**: їм сесія не потрібна.
   - Перевірити в дашборді hosted-проєкту, що використовуються **асиметричні JWT signing keys** (робить користувач).
5. **RLS** — підтверджено підхід плану: `(select auth.uid())`, `to authenticated`, `security definer`-функції в неекспонованій схемі `private` з `set search_path = ''` і повністю кваліфікованими іменами, індекси на всіх колонках з політик (у складених індексах рахується лише перша колонка). Дані для авторизації — не в `user_metadata` (користувач може їх змінити); ролі беремо з `business_members`, не з JWT.
6. **Вбудована пошта Auth:** листи лише на адреси членів команди організації, **2 листи / год**, без SLA — «для тестів і демо». Наслідок: публічна реєстрація з підтвердженням email у hosted-проєкті не працюватиме для відвідувачів. Демо-вхід за ролями (питання 4) від пошти не залежить; як бути з реєстрацією нового бізнесу — див. «Питання до користувача» нижче.
7. **Supabase Cron:** `pg_cron` (+ `pg_net` для HTTP), рекомендовано ≤ 8 одночасних задач і ≤ 10 хв на задачу; секрети — у Vault. **Застереження з документації:** `pg_net` пише розшифровані заголовки в `net.http_request_queue`, тож будь-яка роль із входом у БД може прочитати секрет. Наслідки:
   - у заголовку — лише окремий `CRON_SECRET` (ротується), **ніколи не Supabase secret key**;
   - очищення прострочених холдів і SQL-частину скидання демо робити **чистим SQL** (`cron.schedule` викликає функцію напряму, без HTTP); HTTP — лише там, де потрібен зовнішній світ: відправка Telegram і скасування тестової підписки Stripe.
8. **`btree_gist`** доступне (trusted extension з PG 13), ставити в схему `extensions`. Уточнення до exclusion constraint:
   - діапазон напіввідкритий `'[)'` (запис до 11:30 і запис з 11:30 не конфліктують);
   - вираз constraint бачить лише колонки свого рядка і має бути IMMUTABLE; `timestamptz + interval` — STABLE (залежить від `TimeZone`), тому **кінець буфера зберігається готовою колонкою `blocked_until`** (рахує `create_booking` з `buffer_min` послуги на момент бронювання); generated column теж не підходить з тієї ж причини;
   - `check (ends_at > starts_at and blocked_until >= ends_at)`; помилку **SQLSTATE 23P01** (`exclusion_violation`) у RPC перетворювати на «slot just taken».

## Stripe

9. **Sandboxes:** для нових інтеграцій Stripe радить загальні sandboxes замість «test mode sandbox», і **окремі sandboxes для локальної розробки та CI**. Повтори вебхуків у sandbox — лише 3 спроби за кілька годин (у live — до 3 днів).
10. **Анонімний `stripe sandbox create`** (без реєстрації, ключі одразу) — **живе 7 днів**, далі потрібно «claim» у повноцінний акаунт. Для задеплоєного демо не годиться; рішення з питання 1 не змінює. Можна використати лише як одноразовий sandbox для CI — за бажанням користувача.
11. **Checkout для підписок:** Stripe-hosted, `mode: 'subscription'`; рекомендовано `subscription_data.billing_mode.type = 'flexible'` (API ≥ 2025-06-30.basil). Node SDK — стиль `new StripeClient(...)` / `client.v1.checkout.sessions.create(...)`.
   - Мінімальні події: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`; для скасування й змін через Portal — ще `customer.subscription.updated` / `customer.subscription.deleted`.
   - **Thin events** Stripe тепер радить для нових інтеграцій. Наш підхід «подія → перечитати підписку з API» лягає на них природно; на етапі 11 перевірити, чи є потрібні типи в каталозі thin events, інакше — snapshot.
12. **Вебхук:** сирий body (`await request.text()` у Route Handler), допуск часу підпису 5 хв (не ставити 0), дедуплікація за `event.id` (не за `created`), порядок подій не гарантований, швидко віддавати 2xx. Підтверджує план (`stripe_events` + перечитування підписки).
13. **Customer Portal:** використовувати Customers v1 (`customer: cus_…`), а не Accounts v2 (`customer_account`). Налаштування Portal (оновлення картки, скасування) — у дашборді sandbox, робить користувач.

## Сторонні інструкції в документації

Сторінки документації Supabase містили текст, адресований AI-агентам (з проханням сформувати й надіслати фідбек у Supabase). Це не стосується задачі — проігноровано.

## Рішення користувача за підсумками етапу

- **Реєстрація нового бізнесу в задеплоєному демо — відкрита, без підтвердження email** (2026-11-15). Turnstile + rate limit; акаунти й бізнеси відвідувачів видаляються нічним скиданням через 24 год; скидання пароля немає — зазначити в README.

## Джерела

- [Next.js — November 2026 Security Release](https://nextjs.org/blog/november-2026-security-release)
- [Next.js — proxy.js](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Next.js — Caching (Cache Components)](https://nextjs.org/docs/app/getting-started/caching)
- [endoflife.date — Next.js](https://endoflife.date/nextjs)
- [Supabase — Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase — Cron](https://supabase.com/docs/guides/cron)
- [Supabase — Scheduling Edge Functions (pg_net + Vault)](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase — Extensions](https://supabase.com/docs/guides/database/extensions)
- [Stripe — Build a subscriptions integration (Stripe-hosted)](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted)
- [Stripe — Webhooks](https://docs.stripe.com/webhooks)
- [Stripe — Sandboxes](https://docs.stripe.com/sandboxes)
- [Stripe CLI — sandbox](https://docs.stripe.com/cli/sandbox)
