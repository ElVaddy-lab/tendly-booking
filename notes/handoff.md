# Передача роботи — Tendly (стан на 2026-11-15)

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
| *Етап 6* | Адмінка `/dashboard`, інвайти `/invite/[token]`, візуальне узгодження всіх 7 не-Hero блоків із референсами `1.C` |

Щоб перенести проєкт в інше середовище, потрібен або push у GitHub (лише за командою користувача), або копія папки.

## Етапи PLAN.md

- ✅ 1. Відкриті питання — усі 6 вирішено (Stripe: акаунт зі США, **лише sandbox**, без живих платежів і без американських бізнес-даних; назва Tendly; без email клієнтам; демо-вхід за ролями; барбершоп; тарифи Free 3 staff / 5 services / 100 bookings, Pro $19 — 10 staff, без лімітів, Telegram, `.ics`).
- ✅ 2. Звірка з документацією → `notes/stage2-docs.md`. Реєстрація в демо відкрита без підтвердження email.
- ✅ 3. Каркас.
- ✅ 4. Схема, RLS, слоти, `create_booking`.
- ✅ Поза планом: дизайн-система і лендинг (процес impeccable, див. нижче).
- ✅ 5. Онбординг: `/sign-in`, `/sign-up` (Supabase Auth + Turnstile), `create_business` і `complete_onboarding` RPC, перша послуга й розклад.
- ✅ 6. Адмінка `/dashboard` (послуги, персонал, розклад, time off), інвайти `/invite/[token]` і редизайн не-Hero блоків під палітру `1.C`.
- ⏭️ **Наступний — 7. Публічна сторінка бронювання (`/b/[slug]`)**: вибір послуги, майстра, дати й слота через `available_slots`, форма з Turnstile → `create_booking`, підтвердження + `.ics` (і підключення кнопки «Book» на лендингу).
- Далі 8–16 за планом.

## База даних (`supabase/`)

- Міграції: `20261115100000_core_schema.sql`, `…100100_rls_policies.sql`, `…100200_available_slots.sql`, `…100300_create_booking.sql`, `…100400_onboarding.sql`, `…100500_admin_and_invites.sql`.
- Тести: `supabase/tests/database/000…060_*.test.sql` (154 перевірки, включно з DST для Kyiv і New York, онбордингом, адмінкою й інвайтами).
- Ключові рішення: `bookings.blocked_until` (кінець буфера зберігається, бо `timestamptz + interval` не IMMUTABLE); exclusion constraint `(staff_id, [starts_at, blocked_until)) where status = 'confirmed'`; хелпери RLS у схемі `private` (`business_ids_with_role`, `own_staff_ids`); анонім не має привілеїв на таблиці з персональними даними; `create_booking` — security definer, будь-яка відмова → `P0001 slot_unavailable`, токен керування — лише SHA-256 у БД.
- Свідомо відкладено: RPC створення бізнесу (етап 5), ліміти тарифу (11), гонка двох вкладок — Playwright (12), «змінені години» з додатковим часом.

## Лендинг і дизайн-система

- Сторінка: `src/app/page.tsx`; компоненти й стилі: `src/app/_landing/` (`booking-card.tsx`, `race-demo.tsx`, `landing.module.css`); дати картки: `src/lib/demo-days.ts` (+ тест), рахуються на сервері в поясі Europe/Kyiv (`"use cache"`, щогодини).
- Світ: денне світло на світлому дубі, папір `#f7f0e9`, чорнило `#1c1813` як єдиний сильний акцент, пісочний `#e3c9a9` лише для вибору (завжди з чорнильною рамкою), шрифт Krub (300/400/500/600, `next/font`), тіні вниз-ліворуч. Усе описано в `DESIGN.md` (токени у frontmatter + правила) і `.impeccable/design.json`.
- Перший екран повторює затверджений макет (`.impeccable/mocks/comp-1-centered-card.png`, локально, не в git) у пропорціях `--u = 100vw / 2752`; нижче 1100px — перебудова в rem.
- Зображення: `public/plates/` (згенеровані у Flow, промпт вшито в кожен файл; `wood-ground.png` — 9 МБ, перевірити на етапі продуктивності).
- Важливе виправлення конфігурації: у `next.config.ts` правило Tailwind для Turbopack обмежено `globals.css`, інакше CSS-модулі не працюють.
- Процес impeccable: build-phase завершено з вердиктом `ship` після фінального огляду. Для одного регіону (циферблат у заголовку на ширині 1440) користувач прийняв розбіжність з макетом.

## Відомі відкриті пункти

- Кнопка «Book» на лендингу показує статус замість справжнього запису; слоти/послуги в картці — демо-дані. Підключити до `available_slots` / `create_booking` на етапі 7 (форма → Server Action з прогресивним покращенням).
- Немає сторінок `/sign-in`, `/sign-up`, `/demo/owner|manager|staff` (етапи 5 і 13). Тексти «One click signs you in…» і «Demo data resets every night» мають стати правдою до деплою.
- Дві дрібні розбіжності з макетом: обідок циферблата торкається верху кружечка; людина на аватарі «Anyone» трохи праворуч (чисто виправляється перекадруванням пластини).
- Між 861 і 1100px сторінка вже у вертикальній версії — перевірити на реальному планшеті.

## Перевірки (усі зелені на момент передачі)

```bash
pnpm lint
pnpm typecheck
pnpm test:run          # 53 Vitest
pnpm test:db           # 154 pgTAP (потрібен локальний Supabase)
pnpm test:e2e          # 12 Playwright + axe
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
