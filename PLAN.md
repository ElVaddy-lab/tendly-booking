# План: Tendly — SaaS онлайн-бронювання для малого бізнесу (демо для портфоліо)

Створено 2026-11-15. Стек: **Next.js + Supabase + Stripe (sandbox)**. Відкриті питання (розділ «Відкриті питання») користувач вирішує на початку сесії розробки, по одному; решта — нижче.

## Навіщо

Перший проєкт у портфоліо, що показує **повний SaaS**: мультиарендність, ролі, публічні сторінки, підписку, фонові задачі. Доповнює Shopify-трійку (Ostiv → Tessel → Alongside) і відкриває другий профіль Upwork — React / Next.js.

Зріз Upwork 2026-11-13 (один день, пошук за ключовими словами): Next.js — 42 вакансії за добу, медіана $300 / $25 год; Supabase — медіана $500; Stripe — $700 / $40 год. Бронювання — один із найчастіших запитів «MVP на Next.js + Supabase» (студії, салони, репетитори, клініки), а також «доробіть застосунок з AI-конструктора»: подвійні бронювання, зламані часові пояси, оплата без вебхуків. Цей проєкт показує, як зробити це правильно.

**Що клієнт має побачити за перші 30 секунд:** відео або GIF — клієнт салону відкриває публічну сторінку, обирає послугу, майстра й вільний слот у **своєму** часовому поясі, бронює; бронювання миттєво з'являється в календарі адмінки, майстер отримує повідомлення в Telegram; спроба забронювати той самий слот з іншої вкладки — відмова. Далі власник натискає Upgrade і оплачує тестовою карткою 4242 у Stripe Checkout.

## Цілі

1. **Бізнес (tenant)** з публічною сторінкою `/b/[slug]`: послуги, персонал, вибір слота, форма бронювання, підтвердження.
2. **Розклад:** робочі години по днях тижня для кожного працівника, винятки (відпустка, лікарняний, змінені години), буфер між записами, мінімальний час до запису, горизонт запису (напр. 60 днів).
3. **Слоти рахує Postgres** з урахуванням часового поясу бізнесу й переходів на літній / зимовий час; клієнт бачить час у своєму поясі.
4. **Подвійне бронювання неможливе на рівні БД** — exclusion constraint (`btree_gist`, `tstzrange … &&`), а не лише перевірка в коді.
5. **Ролі:** Owner (білінг, налаштування), Manager (розклад, послуги, всі записи), Staff (свій розклад і свої записи). Права — RLS.
6. **Клієнт без акаунта:** керування записом за посиланням з токеном — скасувати чи перенести до дедлайну (напр. за 24 год).
7. **Адмінка:** календар день / тиждень по працівниках, список записів, статуси (confirmed → completed / no-show / cancelled), ручне створення запису, нотатки.
8. **Підписка бізнесу** Free → Pro через Stripe Checkout + Customer Portal; стан — лише з вебхуків; ліміти тарифу перевіряє БД.
9. **Сповіщення:** Telegram-бот для персоналу (новий запис, скасування, нагадування про день), `.ics`-файл для клієнта й `.ics`-підписка календаря для працівника.
10. **Якість:** pgTAP (RLS, слоти, конфлікти, DST), Vitest (вебхуки, валідація), Playwright (бронювання, гонка двох вкладок, ролі), axe — публічна сторінка відповідає WCAG 2.2 AA.
11. **Упаковка:** README, ADR, відео до 5 хв, кейс, Upwork-портфоліо + профіль React / Next.js.

## Не-цілі (не робимо в MVP)

- **Передоплата від клієнтів бізнесу** — потрібен Stripe Connect (гроші йдуть бізнесу, а не платформі). У MVP — «оплата на місці»; Connect — у «Пізніше».
- Двостороння синхронізація з Google Calendar (лише `.ics` в одну сторону).
- Email- і SMS-нагадування клієнтам (email — див. відкрите питання 3).
- Групові заняття, абонементи, черга очікування, повторювані записи.
- Мобільний застосунок, мультимовність інтерфейсу (лише англійська, ціль — Upwork).
- AI-функції (чат-бот запису тощо).

## Анти-цілі (провал, навіть якщо все працює)

- **Подвійне бронювання** при одночасних запитах.
- **Неправильний час:** слот зсувається на годину в день переходу на літній час або показується в поясі сервера.
- **Доступ дає success-сторінка Checkout**, а не вебхук; секретні ключі Stripe / Supabase у браузері чи з `NEXT_PUBLIC_`.
- **Персональні дані клієнтів** (ім'я, телефон, email) видно іншому бізнесу, Staff чужих записів чи через публічну сторінку.
- **Спам-бронювання** без захисту (Turnstile, обмеження частоти).
- **Вигадані цифри й «клієнти»:** демо-бізнес позначений як вигаданий, у кейсі — лише виміряне.
- **Контакти користувача** в застосунку, README, відео.

## Вже вирішено (рішення Claude, підлягає підтвердженню користувачем)

| Що | Рішення |
|---|---|
| Каркас | Next.js **≥ 16.4.6** (остання; листопадовий security release 2026 — у 16.4.5 — закриває cross-tenant cache disclosure, для мультиарендного застосунку критично), App Router, TypeScript strict, pnpm. Cache Components увімкнені: без `unstable_cache`, бізнес — явним рядковим аргументом `use cache`, слоти й персональні дані не кешуються (див. `notes/stage2-docs.md`) |
| UI | Tailwind 4 + **shadcn/ui** (його очікують клієнти Upwork), React Hook Form + Zod; календар адмінки — власна сітка день / тиждень, без важких бібліотек |
| Auth | Supabase Auth email + пароль, `@supabase/ssr`, publishable key, `getClaims()` у `proxy.ts` і для захисту сторінок **та в кожній Server Action** (Proxy — не єдиний захист); публічні маршрути (`/b/*`, `/manage/*`) виключені з matcher Proxy, щоб `Set-Cookie` не потрапив у кеш; Turnstile на вході, реєстрації й публічній формі бронювання |
| Мультиарендність | `businesses` + `business_members (role)`; RLS через `private.has_business_role(business_id, min_role)` (`security definer`, `stable`, виклик у `(select …)`) + індекси |
| Час | Усе в `timestamptz` (UTC); у бізнесу — IANA-пояс; робочі години — локальний `time` + день тижня; слоти генерує SQL-функція `available_slots(business, service, staff?, from, to)` з `AT TIME ZONE`; клієнт отримує ISO-час і форматує через `Intl` |
| Конфлікти | `create extension btree_gist with schema extensions`; кінець буфера зберігається в записі колонкою `blocked_until` (рахує `create_booking`; у виразі constraint `timestamptz + interval` не можна — він STABLE, а не IMMUTABLE); `exclude using gist (staff_id with =, tstzrange(starts_at, blocked_until, '[)') with &&) where (status = 'confirmed')` + `check (ends_at > starts_at and blocked_until >= ends_at)`; бронювання — RPC `create_booking(...)` в одній транзакції, SQLSTATE 23P01 → «слот щойно зайняли» |
| Публічна форма | Анонімний запис іде через RPC з `security definer` і валідацією (а не через пряму вставку в таблицю); токен керування — у БД лише хеш |
| Білінг | Stripe hosted Checkout (`mode=subscription`, `billing_mode: flexible`) + Customer Portal (Customers v1); `business_id` у `metadata`; вебхук `/api/webhooks/stripe`: сирий body → підпис → ідемпотентність за `event.id` (`stripe_events`) → перечитати підписку зі Stripe API → `business_subscriptions`. Події: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` / `.deleted` (thin чи snapshot — вирішити на етапі 11). Supabase secret key — лише в обробнику вебхука (`server-only`) |
| Тарифи (підтверджено 2026-11-15) | Free — до 3 працівників, 5 послуг, 100 записів / міс; Pro — $19 / міс, до 10 працівників, послуги й записи без ліміту, Telegram-сповіщення, `.ics`-підписка. Демо-барбершоп стартує на Free на межі ліміту (3 барбери, 5 послуг) — видно ліміт у БД і шлях Upgrade |
| Фонові задачі | **Supabase Cron**: SQL-задачі (очищення прострочених холдів, скидання демо-даних) — `pg_cron` кличе SQL-функцію напряму; HTTP через `pg_net` на `/api/cron/*` — лише для зовнішнього (Telegram, скасування тестової підписки Stripe). У заголовку — окремий `CRON_SECRET` з Vault, **не** Supabase secret key (`pg_net` зберігає заголовки в `net.http_request_queue`) |
| Telegram | Бот через Bot API (досвід з `E:\freelancehunt-bot`): працівник прив'язує чат через `/start <одноразовий код>` з адмінки; токен бота — лише в `.env` |
| Демо-дані | Вигаданий бізнес (позначка «Demo business — fictional») з 3 працівниками й 5 послугами; публічна сторінка відкрита всім; дані демо скидаються щоночі |
| Хостинг | Vercel + Supabase (безкоштовні тарифи); Stripe — **sandbox** |
| Мова | Англійська (ціль — Upwork) |
| Локальна розробка | Supabase CLI + Docker (Docker 29 є), Stripe CLI (`stripe listen`, `stripe trigger`) — встановлює користувач |

## Як це працює

```
Клієнт ─► /b/[slug] (Server Component, кеш по бізнесу) ─► вибір послуги / майстра ─► available_slots() ─► слоти в поясі клієнта
      └─► форма (Turnstile) ─► Server Action ─► RPC create_booking() ── exclusion constraint ──► бронювання
                                                                   └─► черга сповіщень ─► Telegram персоналу
                                                                   └─► сторінка підтвердження + .ics + посилання керування (токен)

Owner ─► Upgrade ─► Checkout Session (metadata.business_id) ─► checkout.stripe.com ─► вебхук ─► business_subscriptions ─► ліміти в БД
pg_cron ─► /api/cron/reminders, /api/cron/demo-reset (секрет у заголовку)
```

**Модель даних (нарис):** `businesses (slug, name, timezone, settings)`, `business_members (user_id, role)`, `staff (member_id?, display_name, telegram_chat_id)`, `services (name, duration_min, buffer_min, price_display)`, `staff_services`, `weekly_hours (staff_id, weekday, start_time, end_time)`, `time_off (staff_id, tstzrange)`, `bookings (staff_id, service_id, starts_at, ends_at, status, customer_name, customer_email, customer_phone, notes, manage_token_hash)`, `business_subscriptions`, `stripe_events`, `notification_outbox`.

**Права (RLS):**

| Дія | Owner | Manager | Staff | Публічно |
|---|---|---|---|---|
| Бачити послуги, персонал, вільні слоти | ✓ | ✓ | ✓ | ✓ (без персональних даних) |
| Створити запис | ✓ | ✓ | свій | через RPC з Turnstile |
| Бачити записи й дані клієнтів | всі | всі | лише свої | — (лише власний запис за токеном) |
| Розклад, послуги, персонал | ✓ | ✓ | свої винятки | — |
| Білінг, налаштування бізнесу | ✓ | — | — | — |

## Технічні вимоги

- **Доступність публічної сторінки (WCAG 2.2 AA):** вибір дати й слота з клавіатури (`radiogroup` / roving tabindex), оголошення завантаження слотів і помилок у `aria-live`, цілі ≥ 24×24 px, видимий фокус, контраст, `prefers-reduced-motion`. Перевірка axe + вручну.
- **Швидкодія публічної сторінки:** серверний рендер, мінімум клієнтського JS, Lighthouse mobile ≥ 90 (джерело цифр — PageSpeed Insights, як у Tessel).
- **Безпека:** RLS на кожній таблиці, жодного service key в рантаймі, крім вебхука й cron; rate limit на бронювання (за IP + email); перевірка підпису вебхуків Stripe; токени керування — хеш у БД, термін дії.
- **Персональні дані:** мінімум полів (ім'я, email, телефон — необов'язковий), видалення даних клієнта на запит (кнопка в адмінці), записи демо стираються щоночі.

## Якість і перевірка

- **pgTAP:** матриця «роль × таблиця × дія» (+ не-учасник і анонім); `available_slots` — звичайний день, винятки, буфер, мінімальний час до запису, **день переходу на літній / зимовий час** (Europe/Kyiv і America/New_York); exclusion constraint; ліміти тарифу.
- **Vitest:** вебхук Stripe (невірний підпис, дубль події, події не по порядку, невідомий бізнес), валідація форм, форматування часу в поясі клієнта.
- **Playwright:** повний сценарій запису; **дві вкладки бронюють один слот одночасно** → одна отримує відмову; Staff не бачить чужих записів; скасування за посиланням; Upgrade до редіректу на `checkout.stripe.com` (повний платіж — ручний чекліст).
- **axe** на публічній сторінці й у ключових екранах адмінки; Lighthouse публічної сторінки.
- CI (GitHub Actions): lint, typecheck, Vitest, `supabase test db`, Playwright проти локального Supabase.

## Етапи

### Підготовка
- [x] 1. Відкриті питання (див. нижче), по одному — усі 6 вирішено 2026-11-15.
- [x] 2. Звірити з актуальною документацією: Next.js 16.4 (`proxy.ts`, кешування), Supabase SSR і RLS, Supabase Cron, Stripe Checkout для підписок, Customer Portal, Sandboxes. Розбіжності — у `notes/stage2-docs.md` (2026-11-15). **Вирішено 2026-11-15:** реєстрація в задеплоєному демо відкрита, **без підтвердження email** (вбудована пошта Supabase — лише команда, 2 листи / год). Захист: Turnstile (вбудований CAPTCHA Supabase Auth) + rate limit; нічне скидання видаляє бізнеси й акаунти відвідувачів, старші за 24 год; скидання пароля немає (без пошти) — чесно в README. «Confirm email» вимикає в дашборді користувач.
- [x] 3. (2026-11-15: Next 16.4.6 + Cache Components, shadcn radix-nova, Supabase CLI 2.122.1 як devDependency, Vitest + Playwright + axe + pgTAP зелені локально; git ще не ініціалізований) Каркас: `create-next-app`, shadcn/ui, Supabase CLI (`supabase init`, локальний стек у Docker), ESLint, Vitest, Playwright, CI. `CONTEXT.md` з доменною мовою (Business, Member, Staff, Service, Slot, Booking, Time off, Plan).

### Ядро
- [x] 4. Схема, RLS, `available_slots`, `create_booking` + exclusion constraint. **Спершу pgTAP-тести**, потім SQL. Згенерувати типи. (2026-11-15: 4 міграції, 93 pgTAP-перевірки, `supabase db lint` чисто. Свідомо відкладено: RPC створення бізнесу — етап 5; ліміти тарифу — етап 11; гонка двох запитів — Playwright, етап 12 (pgTAP в одній сесії її не відтворить); «змінені години» з додатковим часом — у MVP time off лише забирає час.)
- [x] 4а. (поза планом, 2026-11-15) Дизайн-система й лендинг `/` через impeccable: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`; фінальний огляд — ship. Передача роботи — `notes/handoff.md`.
- [x] 5. Онбординг: реєстрація → створення бізнесу (назва, slug, часовий пояс) → перша послуга й розклад. (2026-11-15: міграція `20261115100400_onboarding.sql` з RPC `create_business` і `complete_onboarding`, 122 pgTAP-перевірки включно з 29 для онбордингу, `/sign-in`, `/sign-up` з Turnstile, двокроковий `/onboarding` і початковий `/dashboard`, 46 Vitest, 10 Playwright + axe.)
- [x] 6. Адмінка: послуги, персонал, робочі години, винятки; запрошення учасника посиланням з роллю. (2026-11-15: міграція `20261115100500_admin_and_invites.sql` з `business_invitations` + RLS і RPC `set_staff_weekly_hours`, `create_business_invitation`, `get_business_invitation`, `accept_business_invitation`; 154 pgTAP-перевірки включно з 32 для адмінки й інвайтів, `supabase db lint` чисто; `/dashboard` CRUD послуг/персоналу/змінних годин/time off у часовому поясі бізнесу + інвайти з ролями, безпечний `next` через `/sign-in`/`/sign-up`, `/invite/[token]`; 53 Vitest, `next build`, 12 Playwright + axe.)
- [x] 7. Публічна сторінка бронювання: послуга → майстер (або «будь-хто») → дата → слот → форма → підтвердження + `.ics`. (2026-11-15: міграція `20261115100600_public_booking.sql` з `p_notes` і rate-limit у `create_booking`; 160 pgTAP-перевірок; `/b/[slug]` з `'use cache'`-каталогом і динамічним `<Suspense>`, 4-колонковою дошкою за референсом `booking-1.jpg` / `1.C`, автовизначенням часового поясу, Turnstile + rate-limit `50/IP` і `5/email` за 10 хв, перфорованим квитком із `.ics` і `/manage/[token]`; 63 Vitest, `next build`, 16 Playwright + axe.)
- [x] 8. Керування записом за посиланням: скасування й перенесення до дедлайну. (2026-11-16: міграція `20261115100700_manage_booking.sql` з `private.available_slots_excluding`, `get_booking_by_token`, `available_slots_for_reschedule`, `cancel_booking` і `reschedule_booking` із перевіркою дедлайну та 30-денним вікном токена; 180 pgTAP-перевірок; `/manage/[token]` у `<Suspense>` з `robots: noindex`, перфорованим квитком, `.ics`, підтвердженням скасування і формою перенесення зі збереженням суміжних слотів, Turnstile + rate-limit `30/IP` і `15/token`; 72 Vitest, `next build`, 20 Playwright + axe.)
- [x] 9. Календар адмінки (день / тиждень по працівниках), список і статуси записів, ручний запис, видалення даних клієнта. (2026-11-16: міграція `20261115100800_dashboard_bookings.sql` з `erased_at`, `create_manual_booking`, `update_booking_status` і `erase_booking_customer_data` із жорсткою перевіркою ролей; 200 pgTAP-перевірок і `supabase db lint` чисто; `/dashboard` календар день / тиждень по працівниках із робочими змінами, винятками й перекриттям блоків, фільтрований список із переходом статусів, двокроковим GDPR-видаленням ПД клієнта й формою ручного/walk-in запису з `/manage/[token]`; 78 Vitest, `next build`, 22 Playwright + axe.)
- [x] 10. Сповіщення: `notification_outbox` → Telegram-бот (прив'язка чату кодом), нагадування через Supabase Cron, `.ics`-підписка для працівника. (2026-11-16: міграція `20261115100900_notifications_and_ics.sql` з `pg_cron` і `pg_net`, колонковим захистом секретів у `public.staff`, `notification_outbox` + тригерами й ідемпотентним `enqueue_daily_staff_reminders`, RPC прив'язки Telegram і `.ics`-підписки; 228 pgTAP-перевірок і `supabase db lint` чисто; `/api/webhooks/telegram`, `/api/cron/reminders` із `CRON_SECRET`, `/api/cal/[token]`, UI прив'язки й `.ics` у `/dashboard`; 89 Vitest, `next build`, 24 Playwright + axe.)
- [x] 11. Stripe: продукт і ціна в sandbox скриптом, Checkout, Customer Portal, вебхук (спочатку тести), ліміти тарифу в БД і в UI. (2026-11-16: міграція `20261115101000_billing_and_limits.sql` із `plan_tier`, `subscription_status`, `business_subscriptions`, `stripe_events`, тригерами лімітів 3/5/100 Free і 10/∞/∞ Pro та RPC `get_business_plan_usage`; 255 pgTAP-перевірок і `supabase db lint` чисто; скрипт `scripts/stripe-setup.mjs` (`pnpm stripe:setup`), `/api/webhooks/stripe` із перевіркою сирого підпису, дедуплікацією за `event.id` і канонічним `subscriptions.retrieve`, Checkout + Customer Portal і розділ «Plan & billing» у `/dashboard`; 99 Vitest, `next build`, 26 Playwright + axe.)

### Якість
- [x] 12. E2E (включно з гонкою двох вкладок), axe, Lighthouse, ручний чекліст оплати й DST. (2026-11-16: ізольовано зовнішні ключі в `playwright.config.ts` для стабільного офлайн-прогону; додано DST-тести в `booking-slots.test.ts` (100 Vitest), одночасну гонку двох вкладок через `Promise.all` + перевірку поясу `America/New_York` і `/invite/[token]` axe WCAG 2.2 AA у `concurrency-and-dst.spec.ts`, аудит Lighthouse 13.6 (`mobile`: Perf 99 / A11y 100 / BP 100 / SEO 100; `desktop`: Perf 100 / A11y 100 / BP 96 / SEO 100) та ручний чекліст `notes/stage12-checklist.md`.)
- [x] 13. Демо-бізнес і нічне скидання (+ видалення бізнесів і акаунтів відвідувачів, старших за 24 год); вхід у демо за ролями Owner / Manager / Staff (див. питання 4) + E2E на обмеження демо-акаунтів. (2026-11-16: міграція `20261115101100_demo_and_reset.sql` + `supabase/seed.sql` з вигаданим барбершопом `Northside Barbers` (`Europe/Kyiv`, Free 3/5), 3 демо-акаунтами (`owner`/`manager`/`staff`), тригерами незмінності демо-запису, учасників, облікових даних в `auth.users` і блокування Telegram, RPC + `pg_cron` `reset_demo_and_expired_data()` для щонічного скидання й очищення >24 год; 278 pgTAP-перевірок і `supabase db lint` чисто; `/demo/[role]`, `/api/cron/demo-reset`, 1-click вхід із `#roles` на `/` і перехід Hero-картки на `/b/northside-barbers`, мітка демо в `/dashboard`; 105 Vitest, `next build`, 30 Playwright + axe.)

### Упаковка
- [x] 14. Деплой: Vercel + hosted Supabase + вебхук Stripe sandbox + Supabase Cron. **Деплой і пуш — лише за командою користувача.** (2026-11-16: hosted Supabase `tendly-demo` (`xuzipblvmhjfvxlbxpfi`, `eu-central-1`), `supabase db push --include-seed` (12 міграцій + `Northside Barbers`), Vault + 4 активні `pg_cron`/`pg_net` задачі (`tendly-drain-notifications-http` `*/5 * * * *`, `tendly-nightly-demo-reset-http` `55 2 * * *`), Stripe Sandbox webhook `we_1UcRSRACAxpxeFMcdGKVYVre` + Customer Portal `bpc_1UcRSTACAxpxeFMc4QNf1pyg`, Telegram `setWebhook` з секретом, Vercel prod `https://tendly-booking.vercel.app` (`12` env-змінних, виправлено гідратацію `#418` у `role-switcher.tsx`); вручну в Supabase Dashboard лишається вимкнути Confirm email і задати `Site URL` / `Redirect URLs`.)
- [x] 15. README англійською (архітектура, модель безпеки, як запустити локально з Stripe CLI), ADR (часові пояси, конфлікти, білінг), відео до 5 хв, `case/` (скріншоти поза git, як у Tessel). (2026-11-16: `README.md` англійською, 3 ADR у `docs/adr/001..003-*.md`, кейс `case/case.md` + сценарій 5-хв відео `case/video-script.md` і 9 скріншотів із продакшну в `case/media/` поза git; запис голосу/відео за сценарієм робить користувач.)
- [x] 16. Портфоліо: Upwork (+ спеціалізований профіль React / Next.js), Freelancehunt (одне зображення), vadymdev; за бажанням — проєкт Project Catalog «Booking MVP on Next.js + Supabase». (2026-11-16: тексти й метадані для Upwork Portfolio, Upwork Project Catalog, Freelancehunt та `vadymdev` зібрано у `case/portfolio.md`, а 4 картки 4:3 для Upwork і колаж 1600×1200 для Freelancehunt відрендерено в `case/media/` поза git; публікацію на майданчиках робить користувач.)

## Пізніше (за бажанням)

- Передоплата / депозити клієнтів через **Stripe Connect** (Express) — найсильніше розширення, якщо sandbox Connect доступний.
- Email-підтвердження й нагадування клієнтам (Resend) — потрібен власний домен.
- Двостороння синхронізація з Google Calendar.
- Кілька локацій бізнесу, групові заняття, черга очікування.
- Віджет бронювання для вставки на сайт клієнта (Shopify / WordPress) — міст до ваших інших ніш.
- Звіти: завантаженість майстрів, no-show, популярні послуги.

## Відкриті питання для сесії розробки (усі вирішено 2026-11-15)

1. ~~**Stripe sandbox.**~~ **Вирішено 2026-11-15:** акаунт зі США (України у списку немає), користувач свідомо лишає його **лише як sandbox**: без активації живих платежів і без американських бізнес-даних; ризик — Stripe може закрити акаунт (тоді демо-оплата перестане працювати, реальних грошей це не стосується). Доступність Checkout, Billing і Customer Portal у sandbox перевірити на етапі 2. Ключі sandbox користувач кладе в `.env.local` сам.
2. ~~**Назва продукту.**~~ **Вирішено 2026-11-15: Tendly.** Пошук не знайшов сервісу запису з такою назвою; відкинуті Hourline, Slotwell, Openhour (зайняті схожими сервісами). Домен не купуємо.
3. ~~**Email клієнтам.**~~ **Вирішено 2026-11-15: без email у MVP.** Клієнт отримує сторінку підтвердження + `.ics` + посилання керування; персонал — Telegram. Resend (потрібен власний домен) — у «Пізніше». На етапі 2 перевірити обмеження вбудованої пошти Supabase Auth (ймовірно, лише адреси членів команди + жорсткий ліміт) і як це впливає на реєстрацію в демо.
4. ~~**Доступ до демо-адмінки.**~~ **Вирішено 2026-11-15: вхід за ролями.** Кнопки «Explore as Owner / Manager / Staff» → Server Action входить у відповідний демо-акаунт (паролі — лише в env, на сторінці облікових даних немає). Захист: нічне скидання; демо-акаунтам заборонено (на рівні БД / Auth, не лише в UI) міняти пароль чи email і видаляти демо-бізнес; Telegram для демо-персоналу не прив'язаний. Owner може пройти Upgrade через Stripe Checkout з карткою 4242.
5. ~~**Тип демо-бізнесу.**~~ **Вирішено 2026-11-15: барбершоп** (вигаданий, з позначкою «Demo business — fictional»): кілька барберів з різними наборами послуг (стрижка, борода, комбо), різні тривалості й буфери, «будь-який майстер». Відкинуті: студія йоги (групові заняття — не-ціль), репетитор (один працівник), фізіотерапевт (дані про здоров'я в нотатках).
6. ~~**Тарифи.**~~ **Вирішено 2026-11-15:** скориговані (див. «Вже вирішено»), бо Free з 1 працівником не вміщав демо з 3 барберами й шлях Upgrade. Нічне скидання повертає демо на Free і скасовує тестову підписку в Stripe sandbox через API. Відомий компроміс: після чийогось Upgrade інші відвідувачі бачать Pro до скидання.

## Джерела

- [Next.js — releases і security release 2026-11](https://endoflife.date/nextjs)
- [Supabase — Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Cron](https://supabase.com/docs/guides/cron)
- [PostgreSQL — exclusion constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION)
- [Stripe — Build a subscriptions integration](https://docs.stripe.com/billing/subscriptions/build-subscription)
- [Stripe — Integrate the customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Stripe — Testing / Sandboxes](https://docs.stripe.com/testing)
