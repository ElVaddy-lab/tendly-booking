begin;

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures. Kyiv barbershop: 30-minute slot grid, 60 min notice, 60 days horizon.
-- 2027-03-01 is a Monday. Kyiv is UTC+2 until 2027-03-28 03:00, then UTC+3.
-- ---------------------------------------------------------------------------
insert into public.businesses (id, slug, name, timezone, slot_step_minutes, min_notice_minutes, booking_horizon_days) values
  ('b0000000-0000-0000-0000-000000000001', 'north-barbers', 'North Barbers', 'Europe/Kyiv', 30, 60, 60),
  ('b0000000-0000-0000-0000-000000000002', 'south-cuts', 'South Cuts', 'America/New_York', 30, 60, 60);

insert into public.staff (id, business_id, display_name, is_active) values
  ('51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Andriy', true),
  ('51000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Marta', true),
  ('51000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Former Barber', false),
  ('52000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Sam', true);

insert into public.services (id, business_id, name, duration_min, buffer_min, is_active) values
  ('5e100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Haircut', 30, 0, true),
  ('5e100000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Beard sculpt', 45, 15, true),
  ('5e100000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Retired', 30, 0, false),
  ('5e100000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Kids cut', 30, 0, true),
  ('5e200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Fade', 30, 0, true);

insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', '5e100000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', '5e200000-0000-0000-0000-000000000001');

-- Andriy: Mon–Thu 09:00–12:00, Fri with a break, Sun 09:00–12:00. Sat: night shift 02:00–05:00 (DST edge case).
insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 1, '09:00', '12:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 2, '09:00', '12:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 3, '09:00', '12:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 4, '09:00', '12:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 5, '09:00', '10:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 5, '11:00', '12:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 7, '02:00', '05:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 7, '09:00', '12:00'),
-- Marta: Mon 09:00–10:00. Former Barber (inactive) also has hours on Monday.
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 1, '09:00', '10:00'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 1, '09:00', '12:00'),
-- Sam (New York): Sun 09:00–12:00.
  ('b0000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', 7, '09:00', '12:00');

-- Tuesday: an existing booking 10:00–10:30 local with a 15 min buffer (blocked until 10:45).
insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000002',
   '2027-03-02 10:00+02', '2027-03-02 10:30+02', '2027-03-02 10:45+02', 'Existing', 'existing@example.test');
-- A cancelled booking on Thursday must not block anything.
insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email, status) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
   '2027-03-04 10:00+02', '2027-03-04 10:30+02', '2027-03-04 10:30+02', 'Cancelled', 'cancelled@example.test', 'cancelled');

-- Wednesday: time off 10:00–11:00 local.
insert into public.time_off (business_id, staff_id, period) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '[2027-03-03 10:00+02, 2027-03-03 11:00+02)');

-- Shorthand: Andriy's haircut slots for one local Kyiv day, as seen at a given moment.
create function pg_temp.andriy_slots(service uuid, day date, seen_at timestamptz default '2027-03-01 00:00+00')
returns setof timestamptz language sql as $$
  select s.starts_at
  from private.available_slots_at(
    'b0000000-0000-0000-0000-000000000001', service, '51000000-0000-0000-0000-000000000001',
    (day::timestamp at time zone 'Europe/Kyiv'), ((day + 1)::timestamp at time zone 'Europe/Kyiv'), seen_at
  ) s
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- A normal day
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-01')), 6,
  'Monday 09:00–12:00 gives six 30-minute slots');
select is((select min(t) from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-01') t), '2027-03-01 07:00+00'::timestamptz,
  'the first slot is 09:00 Kyiv time = 07:00 UTC');
select is((select max(t) from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-01') t), '2027-03-01 11:30+02'::timestamptz,
  'the last slot ends exactly at closing time');
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000002', '2027-03-01')), 5,
  'a 45-minute service only gets slots that fit before closing');
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-05')), 4,
  'a break between two windows on Friday removes the slots in between');

-- ---------------------------------------------------------------------------
-- Existing bookings and buffers
-- ---------------------------------------------------------------------------
select is(
  array(select to_char(t at time zone 'Europe/Kyiv', 'HH24:MI') from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-02') t),
  array['09:00', '09:30', '11:00', '11:30'],
  'an existing booking blocks its time and its buffer'
);
select ok(
  '2027-03-02 09:00+02'::timestamptz in (select * from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000002', '2027-03-02')),
  'a 45+15 min service can end its buffer exactly when the next booking starts'
);
select ok(
  '2027-03-02 09:30+02'::timestamptz not in (select * from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000002', '2027-03-02')),
  'a slot whose own buffer would overlap the next booking is not offered'
);
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-04')), 6,
  'a cancelled booking does not block slots');

-- ---------------------------------------------------------------------------
-- Time off, notice, horizon
-- ---------------------------------------------------------------------------
select is(
  array(select to_char(t at time zone 'Europe/Kyiv', 'HH24:MI') from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-03') t),
  array['09:00', '09:30', '11:00', '11:30'],
  'time off removes the slots it covers'
);
select is(
  array(select to_char(t at time zone 'Europe/Kyiv', 'HH24:MI') from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-04', '2027-03-04 08:10+02') t),
  array['09:30', '10:00', '10:30', '11:00', '11:30'],
  'slots earlier than the minimum notice are hidden'
);
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-05-03')), 0,
  'days beyond the booking horizon have no slots');
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-02-22', '2027-03-01 00:00+00')), 0,
  'past days have no slots');

-- ---------------------------------------------------------------------------
-- Daylight saving time
-- ---------------------------------------------------------------------------
select is(
  (select min(t) from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-21') t where t >= '2027-03-21 06:00+00'),
  '2027-03-21 07:00+00'::timestamptz,
  'Kyiv, Sunday before the switch: 09:00 local = 07:00 UTC'
);
select is(
  (select min(t) from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-28') t where t >= '2027-03-28 05:00+00'),
  '2027-03-28 06:00+00'::timestamptz,
  'Kyiv, DST switch day: 09:00 local = 06:00 UTC, not shifted by an hour'
);
select is(
  array(select t from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000001', '2027-03-28') t where t < '2027-03-28 05:00+00'),
  array['2027-03-28 00:00+00', '2027-03-28 00:30+00', '2027-03-28 01:00+00', '2027-03-28 01:30+00']::timestamptz[],
  'Kyiv, a 02:00–05:00 shift on the switch night lasts two real hours: four slots, no duplicates'
);
select is(
  (select min(s.starts_at) from private.available_slots_at(
     'b0000000-0000-0000-0000-000000000002', '5e200000-0000-0000-0000-000000000001', null,
     '2027-03-07 00:00-05', '2027-03-08 00:00-05', '2027-03-01 00:00+00') s),
  '2027-03-07 14:00+00'::timestamptz,
  'New York, Sunday before the switch: 09:00 local = 14:00 UTC'
);
select is(
  (select min(s.starts_at) from private.available_slots_at(
     'b0000000-0000-0000-0000-000000000002', '5e200000-0000-0000-0000-000000000001', null,
     '2027-03-14 00:00-05', '2027-03-15 00:00-04', '2027-03-01 00:00+00') s),
  '2027-03-14 13:00+00'::timestamptz,
  'New York, DST switch day: 09:00 local = 13:00 UTC'
);

-- ---------------------------------------------------------------------------
-- Who can be booked
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from private.available_slots_at(
     'b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', null,
     '2027-03-01 00:00+02', '2027-03-02 00:00+02', '2027-03-01 00:00+00')),
  8,
  '"any staff" returns slots of every active staff member who offers the service'
);
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000004', '2027-03-01')), 0,
  'a staff member who does not offer the service has no slots for it');
select is((select count(*)::int from pg_temp.andriy_slots('5e100000-0000-0000-0000-000000000003', '2027-03-01')), 0,
  'an inactive service has no slots');

-- ---------------------------------------------------------------------------
-- Public wrapper
-- ---------------------------------------------------------------------------
set local role anon;
select lives_ok(
  $$select * from public.available_slots('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', null,
      now(), now() + interval '7 days')$$,
  'anon can list available slots'
);
select throws_ok(
  $$select * from public.available_slots('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', null,
      now(), now() + interval '15 days')$$,
  '22023', null, 'a range longer than 14 days is rejected'
);
select throws_ok(
  $$select * from private.available_slots_at('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', null,
      now(), now() + interval '1 day', now() - interval '1 year')$$,
  '42501', null, 'anon cannot call the internal function with a fake "now"'
);
reset role;

select * from finish();

rollback;
