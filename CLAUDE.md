# Tendly — SaaS онлайн-бронювання на Next.js + Supabase + Stripe (демо для портфоліо)

Почни з `PLAN.md`: мета, рішення, анти-цілі, етапи й відкриті питання. Відкриті питання користувач вирішує на початку сесії — постав їх по одному, перш ніж писати код. Знахідки звірки з документацією — `notes/stage2-docs.md`; доменна мова — `CONTEXT.md`.

@AGENTS.md

## Хто користувач

Вадим, розробник React / Next.js, WordPress / WooCommerce і Shopify; шукає замовлення на Upwork і Freelancehunt. Спілкування — українською, коротко й по суті. Код, README, тексти застосунку — англійською.

## Правила

- **Чесність.** Бізнес, працівники й записи — демо, позначені як вигадані. Жодних вигаданих метрик, відгуків, «клієнтів». Цифри в кейсі — тільки виміряні.
- **Без контактів користувача** в застосунку, README, відео (email, Telegram, телефон, соцмережі).
- **Секрети** (Stripe secret key, webhook secret, Supabase secret key, токен Telegram-бота, `CRON_SECRET`) — лише в `.env.local` / змінних Vercel; не показувати в чаті, не комітити, без `NEXT_PUBLIC_`.
- **Акаунти й логіни (Stripe, Supabase, Vercel, Telegram BotFather, CLI) робить користувач** — не вводити паролі, ключі чи токени в поля.
- Stripe — лише sandbox. Акаунт зареєстрований зі США (України у списку Stripe немає) — рішення користувача від 2026-11-15, з ризиком, що Stripe закриє акаунт. Тому: ніколи не активувати живі платежі, не вводити й не пропонувати американські бізнес-дані (SSN, EIN, адресу), не пропонувати інші способи обійти обмеження. У README — чесно «Stripe test mode».
- Коміт, пуш і деплой — лише коли користувач попросить.
- Без AI-функцій, поки користувач сам не попросить.
- Перед кодом звіряйся з актуальною документацією Next.js, Supabase і Stripe — туторіали з `middleware.ts`, `getSession()` на сервері та anon key застаріли.
- RLS, слоти й вебхуки — спочатку тести (pgTAP, Vitest), потім код.

## Що вже є поруч

- `E:\portfolio\Site\SignalBoard` — Next.js + Supabase (Auth, RLS, pgTAP, Playwright + axe, CI на локальному Supabase). Корисно як зразок налаштування `@supabase/ssr`, `proxy.ts`, Turnstile і тестів БД. Як продукт користувачу не подобається — не повторювати його дизайн.
- `E:\portfolio\Site\Site-Shopify-Headless` — Tessel (Next.js): вебхуки з HMAC, Vitest + Playwright + axe, Lighthouse через PageSpeed Insights, оформлення README і `case/`.
- `E:\freelancehunt-bot` — Telegram-бот (Python, aiogram): досвід Bot API.
- `E:\portfolio\upwork\` — тексти й галереї проєктів Upwork; `render.mjs` — рендер галерей через Playwright.
