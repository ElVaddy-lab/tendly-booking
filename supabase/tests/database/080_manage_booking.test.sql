begin;

select plan(20);

insert into public.businesses (
  id, slug, name, timezone, slot_step_minutes, min_notice_minutes, booking_horizon_days, cancellation_deadline_hours
) values (
  'b0000000-0000-0000-0000-000000000080',
  'stage8-barbers',
  'Stage 8 Barbers',
  'Europe/Kyiv',
  15,
  60,
  60,
  24
);

insert into public.staff (id, business_id, display_name, is_active) values
  ('51000000-0000-0000-0000-000000000081', 'b0000000-0000-0000-0000-000000000080', 'Andriy', true),
  ('51000000-0000-0000-0000-000000000082', 'b0000000-0000-0000-0000-000000000080', 'Marta', true);

insert into public.services (id, business_id, name, duration_min, buffer_min, price_cents, is_active) values
  ('5e100000-0000-0000-0000-000000000081', 'b0000000-0000-0000-0000-000000000080', 'Haircut', 30, 10, 3500, true),
  ('5e100000-0000-0000-0000-000000000082', 'b0000000-0000-0000-0000-000000000080', 'Retired trim', 30, 0, 2000, false);

insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000080', '51000000-0000-0000-0000-000000000081', '5e100000-0000-0000-0000-000000000081'),
  ('b0000000-0000-0000-0000-000000000080', '51000000-0000-0000-0000-000000000082', '5e100000-0000-0000-0000-000000000081'),
  ('b0000000-0000-0000-0000-000000000080', '51000000-0000-0000-0000-000000000081', '5e100000-0000-0000-0000-000000000082');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
select 'b0000000-0000-0000-0000-000000000080', s.id, wd, '09:00', '17:00'
from public.staff s cross join generate_series(1, 7) wd
where s.business_id = 'b0000000-0000-0000-0000-000000000080';

create function pg_temp.slot(day_offset int, local_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/Kyiv')::date + day_offset) + local_time) at time zone 'Europe/Kyiv';
$$;

create table pg_temp.tokens (
  label text primary key,
  booking_id uuid,
  token text
);
grant all on pg_temp.tokens to anon;

set local role anon;

-- Booking A: Day +4 10:00 Kyiv with Andriy (30 min + 10 min buffer -> blocked until 10:40)
with created as (
  select * from public.create_booking(
    'b0000000-0000-0000-0000-000000000080',
    '5e100000-0000-0000-0000-000000000081',
    '51000000-0000-0000-0000-000000000081',
    pg_temp.slot(4, '10:00'),
    'Olena Customer',
    'olena-manage@example.test',
    '+380501234567',
    'Europe/Kyiv',
    'Sharp taper'
  )
)
insert into pg_temp.tokens (label, booking_id, token)
select 'a', c.booking_id, c.manage_token from created c;

-- Booking B: Day +4 12:00 Kyiv with Andriy (blocks 11:30..12:40)
with created as (
  select * from public.create_booking(
    'b0000000-0000-0000-0000-000000000080',
    '5e100000-0000-0000-0000-000000000081',
    '51000000-0000-0000-0000-000000000081',
    pg_temp.slot(4, '12:00'),
    'Blocker Booking',
    'blocker-manage@example.test'
  )
)
insert into pg_temp.tokens (label, booking_id, token)
select 'b', c.booking_id, c.manage_token from created c;

reset role;

-- Booking C: inside 24h cancellation deadline (starts in 6 hours)
insert into public.bookings (
  id, business_id, staff_id, service_id, starts_at, ends_at, blocked_until,
  customer_name, customer_email, customer_timezone, manage_token_hash
) values (
  'b1000000-0000-0000-0000-000000000083',
  'b0000000-0000-0000-0000-000000000080',
  '51000000-0000-0000-0000-000000000081',
  '5e100000-0000-0000-0000-000000000081',
  now() + interval '6 hours',
  now() + interval '6 hours 30 minutes',
  now() + interval '6 hours 40 minutes',
  'Inside Deadline',
  'deadline@example.test',
  'Europe/Kyiv',
  encode(sha256(convert_to('stage8-inside-deadline-token-0000000000000000000000000000000083', 'UTF8')), 'hex')
);
insert into pg_temp.tokens values (
  'c',
  'b1000000-0000-0000-0000-000000000083',
  'stage8-inside-deadline-token-0000000000000000000000000000000083'
);

-- Booking D: retention-expired (ended 31 days ago)
insert into public.bookings (
  id, business_id, staff_id, service_id, starts_at, ends_at, blocked_until,
  customer_name, customer_email, manage_token_hash
) values (
  'b1000000-0000-0000-0000-000000000084',
  'b0000000-0000-0000-0000-000000000080',
  '51000000-0000-0000-0000-000000000081',
  '5e100000-0000-0000-0000-000000000081',
  now() - interval '31 days',
  now() - interval '31 days' + interval '30 minutes',
  now() - interval '31 days' + interval '40 minutes',
  'Expired Link',
  'expired@example.test',
  encode(sha256(convert_to('stage8-expired-token-0000000000000000000000000000000000000000084', 'UTF8')), 'hex')
);
insert into pg_temp.tokens values (
  'd',
  'b1000000-0000-0000-0000-000000000084',
  'stage8-expired-token-0000000000000000000000000000000000000000084'
);

-- Booking E: confirmed booking for retired (inactive) service at Day +5
insert into public.bookings (
  id, business_id, staff_id, service_id, starts_at, ends_at, blocked_until,
  customer_name, customer_email, manage_token_hash
) values (
  'b1000000-0000-0000-0000-000000000085',
  'b0000000-0000-0000-0000-000000000080',
  '51000000-0000-0000-0000-000000000081',
  '5e100000-0000-0000-0000-000000000082',
  pg_temp.slot(5, '10:00'),
  pg_temp.slot(5, '10:30'),
  pg_temp.slot(5, '10:30'),
  'Retired Service Customer',
  'retired@example.test',
  encode(sha256(convert_to('stage8-retired-token-0000000000000000000000000000000000000000085', 'UTF8')), 'hex')
);
insert into pg_temp.tokens values (
  'e',
  'b1000000-0000-0000-0000-000000000085',
  'stage8-retired-token-0000000000000000000000000000000000000000085'
);

-- 1. anon reads summary via valid manage token
set local role anon;
select is(
  (select row(g.status::text, g.can_cancel, g.can_reschedule, g.staff_name, g.notes)::text
   from public.get_booking_by_token((select token from pg_temp.tokens where label = 'a')) g),
  row('confirmed', true, true, 'Andriy', 'Sharp taper')::text,
  'anon can fetch booking details by valid manage token'
);

-- 2. get_booking_by_token does not expose customer PII or token hash columns
reset role;
select is(
  pg_get_function_result('public.get_booking_by_token(text)'::regprocedure) ~* 'customer_email|customer_phone|manage_token_hash',
  false,
  'get_booking_by_token omits customer_email, customer_phone and manage_token_hash'
);

-- 3. Unknown or blank token returns 0 rows
set local role anon;
select is(
  (select count(*)::int from public.get_booking_by_token('non-existent-token')),
  0,
  'unknown token returns zero rows'
);

-- 4. available_slots_for_reschedule includes slot overlapping Booking A itself (Day+4 10:15)
select ok(
  pg_temp.slot(4, '10:15') in (
    select s.starts_at
    from public.available_slots_for_reschedule(
      (select token from pg_temp.tokens where label = 'a'),
      '51000000-0000-0000-0000-000000000081',
      pg_temp.slot(4, '09:00'),
      pg_temp.slot(4, '17:00')
    ) s
  ),
  'reschedule availability excludes the booking itself so adjacent overlapping slots (10:15) are offered'
);

-- 5. available_slots_for_reschedule still blocks slots overlapping other bookings (Booking B at 12:00 blocks 11:30)
select ok(
  pg_temp.slot(4, '11:30') not in (
    select s.starts_at
    from public.available_slots_for_reschedule(
      (select token from pg_temp.tokens where label = 'a'),
      '51000000-0000-0000-0000-000000000081',
      pg_temp.slot(4, '09:00'),
      pg_temp.slot(4, '17:00')
    ) s
  ),
  'reschedule availability still blocks slots overlapping another booking + buffer'
);

-- 6. available_slots_for_reschedule rejects window > 14 days
select throws_ok(
  $$select * from public.available_slots_for_reschedule(
      (select token from pg_temp.tokens where label = 'a'),
      null,
      now(),
      now() + interval '15 days'
    )$$,
  '22023', null,
  'available_slots_for_reschedule rejects windows longer than 14 days'
);

-- 7. reschedule_booking succeeds to 10:15 with the same barber (overlapping old [10:00, 10:40))
select is(
  (select row(r.staff_id, r.starts_at, r.ends_at)::text
   from public.reschedule_booking(
     (select token from pg_temp.tokens where label = 'a'),
     '51000000-0000-0000-0000-000000000081',
     pg_temp.slot(4, '10:15')
   ) r),
  row('51000000-0000-0000-0000-000000000081'::uuid, pg_temp.slot(4, '10:15'), pg_temp.slot(4, '10:45'))::text,
  'reschedule_booking moves a booking cleanly into a slot overlapping its own previous time'
);

-- 8. Previously occupied 09:30 slot (blocked by old 10:00 start) is now bookable because 09:30+40m=10:10 <= 10:15
select is(
  (select count(*)::int from public.create_booking(
    'b0000000-0000-0000-0000-000000000080',
    '5e100000-0000-0000-0000-000000000081',
    '51000000-0000-0000-0000-000000000081',
    pg_temp.slot(4, '09:30'),
    'Freed Morning',
    'freed0930@example.test'
  )),
  1,
  'old slot space freed by reschedule is immediately bookable'
);

-- 9. reschedule_booking with NULL ("Anyone available") at 12:00 picks Marta since Andriy is busy with Booking B
select is(
  (select r.staff_id
   from public.reschedule_booking(
     (select token from pg_temp.tokens where label = 'a'),
     null,
     pg_temp.slot(4, '12:00')
   ) r),
  '51000000-0000-0000-0000-000000000082'::uuid,
  'reschedule_booking with Anyone available assigns a free eligible staff member'
);

-- 10. reschedule_booking into occupied slot for Andriy fails with slot_unavailable
select throws_ok(
  $$select * from public.reschedule_booking(
      (select token from pg_temp.tokens where label = 'a'),
      '51000000-0000-0000-0000-000000000081',
      pg_temp.slot(4, '12:00')
    )$$,
  'P0001', 'slot_unavailable',
  'reschedule_booking rejects an unavailable slot'
);

-- 11. Booking inside 24h deadline cannot be rescheduled
select throws_ok(
  $$select * from public.reschedule_booking(
      (select token from pg_temp.tokens where label = 'c'),
      '51000000-0000-0000-0000-000000000082',
      pg_temp.slot(4, '14:00')
    )$$,
  'P0001', 'deadline_passed',
  'reschedule_booking inside cancellation deadline raises deadline_passed'
);

-- 12. Booking inside 24h deadline cannot be cancelled
select throws_ok(
  $$select * from public.cancel_booking((select token from pg_temp.tokens where label = 'c'))$$,
  'P0001', 'deadline_passed',
  'cancel_booking inside cancellation deadline raises deadline_passed'
);

-- 13. available_slots_for_reschedule inside 24h deadline raises deadline_passed
select throws_ok(
  $$select * from public.available_slots_for_reschedule(
      (select token from pg_temp.tokens where label = 'c'),
      null,
      now(),
      now() + interval '7 days'
    )$$,
  'P0001', 'deadline_passed',
  'available_slots_for_reschedule inside deadline raises deadline_passed'
);

-- 14. cancel_booking cancels confirmed Booking A before deadline
select is(
  (select c.status::text from public.cancel_booking((select token from pg_temp.tokens where label = 'a')) c),
  'cancelled',
  'cancel_booking marks confirmed booking as cancelled'
);

-- 15. After cancellation, get_booking_by_token shows cancelled status with can_cancel=false, can_reschedule=false
select is(
  (select row(g.status::text, g.can_cancel, g.can_reschedule, g.cancelled_at is not null)::text
   from public.get_booking_by_token((select token from pg_temp.tokens where label = 'a')) g),
  row('cancelled', false, false, true)::text,
  'cancelled booking remains readable via token with modification flags false'
);

-- 16. Cancelled booking cannot be cancelled again or rescheduled
select throws_ok(
  $$select * from public.cancel_booking((select token from pg_temp.tokens where label = 'a'))$$,
  'P0001', 'booking_not_confirmed',
  'cancelling an already cancelled booking fails with booking_not_confirmed'
);

-- 17. Cancelling Booking A frees Day+4 12:00 with Marta for a new booking
select is(
  (select count(*)::int from public.create_booking(
    'b0000000-0000-0000-0000-000000000080',
    '5e100000-0000-0000-0000-000000000081',
    '51000000-0000-0000-0000-000000000082',
    pg_temp.slot(4, '12:00'),
    'Reclaimed Slot',
    'reclaimed@example.test'
  )),
  1,
  'cancelled booking immediately frees its slot for new bookings'
);

-- 18. Expired token (>30 days past ends_at) is invisible and unmodifiable
select is(
  (select row(
     (select count(*)::int from public.get_booking_by_token((select token from pg_temp.tokens where label = 'd'))),
     (select can_cancel from public.get_booking_by_token((select token from pg_temp.tokens where label = 'e')))
   )::text),
  row(0, true)::text,
  'expired booking token returns 0 rows while retired-service active token remains cancellable'
);

-- 19. Retired-service booking cannot be rescheduled, but can be cancelled
select throws_ok(
  $$select * from public.reschedule_booking(
      (select token from pg_temp.tokens where label = 'e'),
      '51000000-0000-0000-0000-000000000081',
      pg_temp.slot(5, '14:00')
    )$$,
  'P0001', 'slot_unavailable',
  'booking for a retired service cannot be rescheduled'
);

-- 20. private.available_slots_excluding is locked down from anon
select throws_ok(
  $$select * from private.available_slots_excluding(
      'b0000000-0000-0000-0000-000000000080',
      '5e100000-0000-0000-0000-000000000081',
      null,
      now(),
      now() + interval '1 day',
      now(),
      null
    )$$,
  '42501', null,
  'anon cannot execute private.available_slots_excluding directly'
);

reset role;

select * from finish();

rollback;
