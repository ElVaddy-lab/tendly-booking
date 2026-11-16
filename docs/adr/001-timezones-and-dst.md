# ADR 001 — Time Zones and Daylight Saving Time

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Small service businesses operate in a local city wall clock (`09:00–18:00` Monday–Friday), while customers may browse from another time zone (for example, booking an appointment in Kyiv while travelling in New York) or across Daylight Saving Time (DST) transitions. Storing schedule templates as UTC offsets or pre-computing UTC slot timestamps drifts by an hour every Spring Forward / Fall Back date.

## Decision

1. **Each Business owns an authoritative IANA time zone** (`businesses.iana_timezone`, e.g. `Europe/Kyiv`, `America/New_York`), validated against `pg_timezone_names` and browser-canonicalized (`timezone.ts`).
2. **Appointments store exact instants (`timestamptz`):** `bookings.starts_at`, `bookings.ends_at`, and `bookings.blocked_until` are stored in UTC so intervals never become ambiguous during Fall Back (`02:00` occurring twice) or overlap comparisons.
3. **Recurring shifts stay wall-clock local:** `weekly_hours` stores `(weekday, start_time, end_time)` as Postgres `time` values interpreted in `businesses.iana_timezone` via `AT TIME ZONE` when generating candidate slots for each local calendar date.
4. **Exceptions store explicit instants:** `time_off` stores `tstzrange` bounds resolved in the shop's IANA time zone when created in `/dashboard`.
5. **Customer presentation adapts to visitor TZ:** `/b/[slug]` and `/manage/[token]` detect `Intl.DateTimeFormat().resolvedOptions().timeZone`, display slot times clearly in the visitor's zone (plus shop zone context), and record `customer_timezone` on the booking row so notifications and confirmation screens remain consistent.

## Consequences

- DST transitions work without cron backfills or manual admin intervention: `09:00 Europe/Kyiv` on both winter and summer sides of March/October transitions resolves cleanly to UTC `07:00Z` / `06:00Z` (`bookings`, `.ics` DTSTART, and Telegram reminders stay aligned).
- Tested explicitly in `supabase/tests/database/030_slots.test.sql` (Kyiv + New York DST transitions), `src/lib/booking-slots.test.ts`, and `tests/e2e/concurrency-and-dst.spec.ts`.
