# Передача роботи — Tendly (стан на 2026-11-16)

Короткий конспект для продовження в іншому середовищі. Повні рішення — у `PLAN.md`, правила сесії — у `CLAUDE.md`, звірка з документацією — у `notes/stage2-docs.md`, доменна мова — у `CONTEXT.md`, факти про продукт — у `PRODUCT.md`, дизайн-система — у `DESIGN.md`.

## Що це

**Tendly** — демо SaaS онлайн-бронювання для малого бізнесу (демо-бізнес — вигаданий барбершоп Northside Barbers) для портфоліо на Upwork. Стек: Next.js 16.4.6 (App Router, Cache Components) + Supabase + Stripe (лише sandbox). Код, тексти застосунку — англійською; спілкування з користувачем — українською.

## Git

Гілка `main`, remote **не налаштований**, нічого не запушено. Коміти:

| Коміт | Що |
|---|---|
| `3618e8f` | Каркас: Next.js, Supabase SSR-клієнти, `proxy.ts`, Vitest, Playwright + axe, pgTAP, CI (GitHub Actions) |
| `35f57a2` | Ядро БД: схема, RLS, `available_slots`, `create_booking`, exclusion constraint, 93 pgTAP-перевірки |
| `54dcb88` | Лендинг `/` і дизайн-система (`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`) |
| `f9a7d60` | Етап 5: `/sign-in`, `/sign-up`, двокроковий `/onboarding`, `create_business` і `complete_onboarding` RPC |
| `c46277f` | Етап 6: адмінка `/dashboard`, інвайти `/invite/[token]`, візуальне узгодження всіх 7 не-Hero блоків із референсами `1.C` |
| `f0671db` | Етап 7: публічна сторінка `/b/[slug]`: 4-колонкова дошка + перфорований квиток + `.ics`, міграція `20261115100600_public_booking.sql`, Turnstile, rate limit |
| `6b2a9af` | Етапи 8–9: `/manage/[token]` + календар `/dashboard` (день/тиждень, статуси, ручний запис, GDPR-видалення ПД клієнта), міграції `…100700`–`…100800` |
| `e6901a8` | Етапи 10–11: сповіщення (`notification_outbox` + Telegram + `pg_cron` + `.ics`-підписка) і Stripe-білінг (`stripe:setup`, Checkout/Portal, вебхук, ліміти Free/Pro), міграції `…100900`–`…101000` |
| `e1872b5` | Етапи 12–13: якість (гонка 2 вкладок, `America/New_York` DST, axe, Lighthouse, `notes/stage12-checklist.md`) + демо-бізнес `Northside Barbers`, `/demo/[role]`, `/api/cron/demo-reset`, `seed.sql` і E2E демо-обмежень (`…101100`) |
| *Етап 14* | Деплой: hosted Supabase `xuzipblvmhjfvxlbxpfi` (`db push --include-seed`, Vault + 4 `pg_cron`/`pg_net`), Stripe Sandbox webhook + Portal, Telegram webhook, `https://tendly-booking.vercel.app`, `notes/stage14-deploy.md`, фікс `#418` у `role-switcher.tsx` |

Щоб перенести проєкт в інше середовище, потрібен або push у GitHub (лише за командою користувача), або копія папки.

## Етапи PLAN.md

- ✅ 1. Відкриті питання — усі 6 вирішено (Stripe: акаунт зі США, **лише sandbox**, без живих платежів і без американських бізнес-даних; назва Tendly; без email клієнтам; демо-вхід за ролями; барбершоп; тарифи Free 3 staff / 5 services / 100 bookings, Pro $19 — 10 staff, без лімітів, Telegram, `.ics`).
- ✅ 2. Звірка з документацією → `notes/stage2-docs.md`. Реєстрація в демо відкрита без підтвердження email.
- ✅ 3. Каркас.
- ✅ 4. Схема, RLS, слоти, `create_booking`.
- ✅ Поза планом: дизайн-система і лендинг (процес impeccable, див. нижче).
- ✅ 5. Онбординг: `/sign-in`, `/sign-up` (Supabase Auth + Turnstile), `create_business` і `complete_onboarding` RPC, перша послуга й розклад.
- ✅ 6. Адмінка `/dashboard` (послуги, персонал, розклад, time off), інвайти `/invite/[token]` і редизайн не-Hero блоків під палітру `1.C`.
- ✅ 7. Публічна сторінка бронювання (`/b/[slug]`): 4-колонкова дошка вибору послуги, майстра («Anyone available» або конкретний), дати й слота (`available_slots`, кешований каталог через `'use cache'` + динамічні слоти в `<Suspense>`), форма клієнта з автовизначенням поясу й Turnstile + rate-limit (`50/IP`, `5/email` за 10 хв), перфорований квиток підтвердження + `.ics` + `/manage/[token]`.
- ✅ 8. Керування записом за посиланням (`/manage/[token]`): перегляд деталей без PII (`get_booking_by_token`), перенесення зі зміною майстра або «Anyone available» через `available_slots_excluding` (суміжні сусідні слоти не блокуються власним записом), скасування з вивільненням слота, контроль дедлайну (`cancellation_deadline_hours`) та 30-денного вікна актуальності, Turnstile + rate-limit (`30/IP`, `15/token`), `.ics`.
- ✅ 9. Календар адмінки (`/dashboard` календар день / тиждень по працівниках): денна й тижнева сітки з відображенням робочих змін, time off, перекриття блоків і ролевою ізоляцією (`Owner`/`Manager` бачать усіх, `Staff` — лише свій `staff_id`); фільтрований список записів і переходи `confirmed → completed / no_show / cancelled` (`update_booking_status`); ручний/walk-in запис без вимоги `min_notice_minutes` і email з поверненням `/manage/[token]` (`create_manual_booking`); двокрокове видалення персональних даних клієнта (`erase_booking_customer_data` лише для `Owner`/`Manager`).
- ✅ 10. Сповіщення (`notification_outbox` → Telegram-бот), Supabase Cron та `.ics`-підписка: прив'язка Telegram-чату одноразовим `/start <код>` через вебхук `/api/webhooks/telegram`; тригери черги на створення, перенесення й скасування; щоденний дайджест `enqueue_daily_staff_reminders` (`pg_cron`, ідемпотентний `dedupe_key`) та `/api/cron/reminders` із `CRON_SECRET`; приватна `.ics`-підписка `/api/cal/[token]` із ротацією/відкликанням і маскуванням стертих даних; колонковий захист `telegram_chat_id` і хешів у `public.staff`.
- ✅ 11. Stripe: продукт і ціна $19/міс у sandbox (`scripts/stripe-setup.mjs` / `pnpm stripe:setup`), Stripe Checkout і Customer Portal (`createBillingCheckoutSession` / `createBillingPortalSession`), вебхук `/api/webhooks/stripe` (перевірка сирого підпису, дедуплікація в `stripe_events`, канонічний `subscriptions.retrieve`, без підняття тарифу по query-параметру `?billing=success`), DB-тригери лімітів (`Free`: 3 staff / 5 services / 100 bookings/міс; `Pro`: 10 staff / ∞ services / ∞ bookings) і UI-розділ `Plan & billing` + квоти в `/dashboard`.
- ✅ 12. Якість: ізоляція зовнішніх ключів і `pnpm build && pnpm start` у `playwright.config.ts`, DST unit-тести (`booking-slots.test.ts`), E2E гонки двох вкладок (`Promise.all`) і поясу `America/New_York` + `/invite/[token]` axe WCAG 2.2 AA (`concurrency-and-dst.spec.ts`), аудит Lighthouse 13.6 та ручний чекліст `notes/stage12-checklist.md`.
- ✅ 13. Демо-бізнес і нічне скидання: міграція `20261115101100_demo_and_reset.sql` + `supabase/seed.sql` для вигаданого `Northside Barbers` (`Europe/Kyiv`, Free 3/5), 3 демо-акаунти (`owner`/`manager`/`staff`), DB-тригери захисту демо-бізнесу/учасників/`auth.users` і блокування Telegram, `pg_cron` `reset_demo_and_expired_data()` + `/api/cron/demo-reset` (скасовує тестові Stripe-підписки й видаляє бізнеси/користувачів >24 год), `/demo/[role]`, 1-click вхід із `#roles`, перехід Hero-картки на `/b/northside-barbers` та E2E (`demo-mode.spec.ts`).
- ✅ 14. Деплой: Vercel `https://tendly-booking.vercel.app`, hosted Supabase `tendly-demo` (`xuzipblvmhjfvxlbxpfi`, `eu-central-1`, 12 міграцій + `seed.sql`, Vault + `pg_cron`/`pg_net`), Stripe Sandbox webhook (`we_1UcRSRACAxpxeFMcdGKVYVre`) + Customer Portal, Telegram `setWebhook`; інструкція — `notes/stage14-deploy.md`. У Supabase Dashboard Auth треба вручну вимкнути «Confirm email» і прописати `Site URL` / `Redirect URLs`.
- ⏭️ **Наступний — 15. README + ADR + відео + `case/`**: README англійською, ADR, відео до 5 хв, скріншоти `case/`.
- Далі 16 (портфоліо).

## База даних (`supabase/`)

- Міграції: `20261115100000_core_schema.sql`, `…100100_rls_policies.sql`, `…100200_available_slots.sql`, `…100300_create_booking.sql`, `…100400_onboarding.sql`, `…100500_admin_and_invites.sql`, `…100600_public_booking.sql`, `…100700_manage_booking.sql`, `…100800_dashboard_bookings.sql`, `…100900_notifications_and_ics.sql`, `…101000_billing_and_limits.sql`, `…101100_demo_and_reset.sql` (+ `supabase/seed.sql`).
- Тести: `supabase/tests/database/000…120_*.test.sql` (278 перевірок, включно з DST для Kyiv і New York, онбордингом, адмінкою, інвайтами, публічним бронюванням, керуванням за токеном, адмін-календарем, сповіщеннями / Telegram / `.ics`-підписками, Stripe-підписками й лімітами тарифів, а також демо-обмеженнями та `reset_demo_and_expired_data`). Після E2E-прогонів перед `pnpm test:db` запускати `pnpm db:reset`.
- Ключові рішення: `bookings.blocked_until` (кінець буфера зберігається, бо `timestamptz + interval` не IMMUTABLE); exclusion constraint `(staff_id, [starts_at, blocked_until)) where status = 'confirmed'`; хелпери RLS у схемі `private` (`business_ids_with_role`, `own_staff_ids`); анонім не має привілеїв на таблиці з персональними даними; `create_booking` — security definer, будь-яка відмова → `P0001 slot_unavailable`, токен керування — лише SHA-256 у БД.
- Свідомо відкладено: RPC створення бізнесу (етап 5), ліміти тарифу (реалізовано на етапі 11), гонка двох вкладок — Playwright (12), «змінені години» з додатковим часом.

## Лендинг і дизайн-система

- Сторінка: `src/app/page.tsx`; компоненти й стилі: `src/app/_landing/` (`booking-card.tsx`, `race-demo.tsx`, `landing.module.css`); дати картки: `src/lib/demo-days.ts` (+ тест), рахуються на сервері в поясі Europe/Kyiv (`"use cache"`, щогодини).
- Світ: денне світло на світлому дубі, папір `#f7f0e9`, чорнило `#1c1813` як єдиний сильний акцент, пісочний `#e3c9a9` лише для вибору (завжди з чорнильною рамкою), шрифт Krub (300/400/500/600, `next/font`), тіні вниз-ліворуч. Усе описано в `DESIGN.md` (токени у frontmatter + правила) і `.impeccable/design.json`.
- Перший екран повторює затверджений макет (`.impeccable/mocks/comp-1-centered-card.png`, локально, не в git) у пропорціях `--u = 100vw / 2752`; нижче 1100px — перебудова в rem.
- Зображення: `public/plates/` (згенеровані у Flow, промпт вшито в кожен файл; `wood-ground.png` — 9 МБ, перевірити на етапі продуктивності).
- Важливе виправлення конфігурації: у `next.config.ts` правило Tailwind для Turbopack обмежено `globals.css`, інакше CSS-модулі не працюють.
- Процес impeccable: build-phase завершено з вердиктом `ship` після фінального огляду. Для одного регіону (циферблат у заголовку на ширині 1440) користувач прийняв розбіжність з макетом.

## Відомі відкриті пункти

- Hero-картка лендингу `/` і перемикач `#roles` уже підключені до реального `northside-barbers` (`supabase/seed.sql`, `/demo/[role]`, `/b/northside-barbers`).
- Дві дрібні розбіжності з макетом на `/`: обідок циферблата торкається верху кружечка; людина на аватарі «Anyone» трохи праворуч (чисто виправляється перекадруванням пластини).
- Між 861 і 1100px головна сторінка вже у вертикальній версії — перевірити на реальному планшеті.

## Перевірки (усі зелені на момент передачі)

```bash
pnpm lint
pnpm typecheck
pnpm test:run          # 105 Vitest
pnpm db:reset && pnpm test:db  # 278 pgTAP (потрібен локальний Supabase; db:reset чистить рядки після E2E)
pnpm test:e2e          # 30 Playwright + axe (chromium + mobile-chromium)
```

## Налаштування нового середовища

1. Node ≥ 22.22, pnpm 10.33.4, Docker (для локального Supabase). Supabase CLI — у devDependencies (`pnpm exec supabase`).
2. `pnpm install`
3. `pnpm supabase:start`, потім `pnpm db:reset` (застосує міграції).
4. `.env.local` створити з `.env.example`; локальні URL і ключі Supabase — з `pnpm exec supabase status`. Stripe, Telegram і `CRON_SECRET` поки порожні. **Секрети — лише в `.env.local` / змінних Vercel, не в чат і не в git.**
5. `pnpm dev` → http://localhost:3000.
6. Stripe CLI знадобиться на етапі 11 — встановлює користувач.

## Що лишилось лише на старій машині (не в git)

- `.env.local` (локальні ключі Supabase — відтворюються командою вище).
- `.impeccable/build/`, `.impeccable/review/`, `.impeccable/mocks/`, `.impeccable/reference/` — робочі артефакти дизайн-процесу (макети, скриншоти, звірки). Потрібні лише для повторного проходу impeccable на цьому ж лендингу; `DESIGN.md` і `design.json` від них не залежать.
- `.claude/` — встановлений скіл impeccable і локальні налаштування. Скіл треба встановити в новому середовищі, якщо продовжувати роботу через `/impeccable`.

## Правила, які діють далі (з `CLAUDE.md`)

- Чесність: усе демо позначено як вигадане; жодних вигаданих метрик, відгуків, клієнтів.
- Без контактів користувача в застосунку, README, відео.
- Акаунти й логіни (Stripe, Supabase, Vercel, BotFather) робить користувач.
- Коміт, пуш і деплой — лише за командою користувача.
- RLS, слоти й вебхуки — спершу тести.
- Нові екрани — у системі з `DESIGN.md`; адмінка — щільна й пласка, без дерева під робочими даними.
