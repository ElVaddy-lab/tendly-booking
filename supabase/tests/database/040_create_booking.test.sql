begin;

select plan(17);

-- create_booking() uses the real clock, so fixtures are relative to today.
-- Every staff member works every day 09:00–12:00 Kyiv time; the target day is three days ahead.
insert into public.businesses (id, slug, name, timezone, slot_step_minutes, min_notice_minutes, booking_horizon_days) values
  ('b0000000-0000-0000-0000-000000000001', 'north-barbers', 'North Barbers', 'Europe/Kyiv', 30, 60, 60);

insert into public.staff (id, business_id, display_name) values
  ('51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Andriy'),
  ('51000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Marta'),
  ('51000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Ivan');

insert into public.services (id, business_id, name, duration_min, buffer_min) values
  ('5e100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Haircut', 30, 10);

-- Ivan works but does not offer haircuts.
insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
select 'b0000000-0000-0000-0000-000000000001', s.id, wd, '09:00', '12:00'
from public.staff s cross join generate_series(1, 7) wd
where s.business_id = 'b0000000-0000-0000-0000-000000000001';

create function pg_temp.slot(day_offset int, local_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/Kyiv')::date + day_offset) + local_time) at time zone 'Europe/Kyiv';
$$;

create table pg_temp.result as select * from public.create_booking(
  'b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  pg_temp.slot(3, '09:00'), 'Olena Test', 'Olena@Example.test', null, 'America/Toronto'
) limit 0;
grant all on pg_temp.result to anon;

-- ---------------------------------------------------------------------------
-- A successful public booking
-- ---------------------------------------------------------------------------
set local role anon;

insert into pg_temp.result
select * from public.create_booking(
  'b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  pg_temp.slot(3, '09:00'), '  Olena Test ', 'Olena@Example.test', null, 'America/Toronto'
);

select is((select count(*)::int from pg_temp.result), 1, 'anon can book an available slot');
select ok((select manage_token ~ '^[0-9a-f]{64}$' from pg_temp.result), 'a 256-bit manage token is returned once');

reset role;

select is(
  (select row(b.status, b.ends_at - b.starts_at, b.blocked_until - b.starts_at)::text
   from public.bookings b join pg_temp.result r on r.booking_id = b.id),
  row('confirmed'::public.booking_status, interval '30 minutes', interval '40 minutes')::text,
  'the booking is confirmed with end time and buffer taken from the service'
);
select is(
  (select row(b.customer_name, b.customer_email)::text from public.bookings b join pg_temp.result r on r.booking_id = b.id),
  row('Olena Test', 'olena@example.test')::text,
  'customer name is trimmed and email lower-cased'
);
select is(
  (select b.manage_token_hash from public.bookings b join pg_temp.result r on r.booking_id = b.id),
  (select encode(sha256(convert_to(r.manage_token, 'UTF8')), 'hex') from pg_temp.result r),
  'only the SHA-256 hash of the manage token is stored'
);

-- ---------------------------------------------------------------------------
-- Rejections
-- ---------------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(3, '09:00'), 'Second', 'second@example.test')$$,
  'P0001', 'slot_unavailable', 'the same slot cannot be booked twice'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(3, '09:30'), 'Buffer', 'buffer@example.test')$$,
  'P0001', 'slot_unavailable', 'a slot inside the previous booking''s buffer cannot be booked'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(3, '13:00'), 'Late', 'late@example.test')$$,
  'P0001', 'slot_unavailable', 'a time outside working hours cannot be booked'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(3, '10:10'), 'Off grid', 'grid@example.test')$$,
  'P0001', 'slot_unavailable', 'a time that is not on the slot grid cannot be booked'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(90, '09:00'), 'Far', 'far@example.test')$$,
  'P0001', 'slot_unavailable', 'a time beyond the booking horizon cannot be booked'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000003', pg_temp.slot(3, '10:00'), 'Wrong staff', 'wrong@example.test')$$,
  'P0001', 'slot_unavailable', 'a staff member who does not offer the service cannot be booked for it'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(3, '11:00'), 'Bad email', 'not-an-email')$$,
  '23514', null, 'an invalid email is rejected'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001', pg_temp.slot(3, '11:00'), 'Bad zone', 'zone@example.test', null, 'Mars/Olympus')$$,
  '23514', null, 'an unknown customer time zone is rejected'
);

-- ---------------------------------------------------------------------------
-- "Any staff"
-- ---------------------------------------------------------------------------
insert into pg_temp.result
select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
  null, pg_temp.slot(4, '10:00'), 'Any one', 'any1@example.test');
insert into pg_temp.result
select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
  null, pg_temp.slot(4, '10:00'), 'Any two', 'any2@example.test');

select is(
  (select count(distinct r.staff_id)::int from pg_temp.result r where r.starts_at = pg_temp.slot(4, '10:00')),
  2,
  '"any staff" assigns two different free barbers to the same time'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      null, pg_temp.slot(4, '10:00'), 'Any three', 'any3@example.test')$$,
  'P0001', 'slot_unavailable', '"any staff" fails once everyone who offers the service is busy'
);

reset role;

-- ---------------------------------------------------------------------------
-- Minimum notice (checked against the real clock)
-- ---------------------------------------------------------------------------
update public.businesses set min_notice_minutes = 7 * 24 * 60 where id = 'b0000000-0000-0000-0000-000000000001';
set local role anon;
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000002', pg_temp.slot(3, '11:00'), 'Too soon', 'soon@example.test')$$,
  'P0001', 'slot_unavailable', 'a time inside the minimum notice period cannot be booked'
);
select throws_ok(
  $$select * from public.create_booking('b0000000-0000-0000-0000-000000000099', '5e100000-0000-0000-0000-000000000001',
      null, pg_temp.slot(3, '11:00'), 'Ghost', 'ghost@example.test')$$,
  'P0001', 'slot_unavailable', 'an unknown business cannot be booked'
);
reset role;

select * from finish();

rollback;
