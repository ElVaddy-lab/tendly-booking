# ADR 002 — Slot Computation and Double-Booking Prevention

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Pre-materializing slot tables creates maintenance hazards when a business changes service duration, buffer time, split shifts, or `time_off`. Conversely, checking availability in application code (`SELECT` then `INSERT`) has a TOCTOU race condition when two visitors submit the same slot simultaneously.

## Decision

1. **Compute slots on read in Postgres:** `public.available_slots(p_business_id, p_service_id, p_staff_id, p_from_date, p_to_date)` expands local `weekly_hours` into discrete intervals matching `slot_step_minutes` and `duration_min + buffer_min`, enforces `min_notice_minutes`, and subtracts overlapping `time_off` and `confirmed` bookings.
2. **Persist `blocked_until = ends_at + make_interval(mins => buffer_min)`:** Postgres exclusion constraint expressions must be `IMMUTABLE`, whereas adding an `interval` to `timestamptz` is `STABLE` (depends on session `TimeZone`). Storing the concrete UTC boundary column `blocked_until` (checked by `blocked_until >= ends_at`) makes the exclusion expression strictly `IMMUTABLE`.
3. **Database exclusion constraint (`btree_gist`):**
   ```sql
   exclude using gist (
     staff_id with =,
     tstzrange(starts_at, blocked_until, '[)') with &&
   ) where (status = 'confirmed')
   ```
   Half-open `'[)'` allows back-to-back bookings (`10:00–10:30` and `10:30–11:00` when `buffer_min = 0`) while guaranteeing zero overlapping appointments per staff member under arbitrary concurrency.
4. **Atomic booking & safe error mapping:** `create_booking()` runs as `security definer`, catches `exclusion_violation` (`SQLSTATE 23P01`), and raises a generic availability error (`slot_unavailable`) mapped cleanly by the client UI instead of leaking conflict metadata.
5. **Contiguous reschedules:** `private.available_slots_excluding(..., p_exclude_booking_id)` and `reschedule_booking()` ignore the visitor's own current booking during availability calculation so a customer can shift their appointment by 15 minutes without blocking themselves; the exclusion constraint still protects against any third-party race.

## Consequences

- Two simultaneous `Promise.all` browser submissions for the exact same barber and time slot always result in one confirmed booking and one clean conflict refusal, verified in `tests/e2e/concurrency-and-dst.spec.ts` and `supabase/tests/database/040_create_booking.test.sql`.
- Service `buffer_min` and `duration_min` edits apply retroactively to future open slots immediately without regenerating slot rows, while existing confirmed appointments keep their original booked duration and buffer.
