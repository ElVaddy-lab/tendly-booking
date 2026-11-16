begin;

select plan(6);

insert into public.businesses (id, slug, name, timezone, slot_step_minutes, min_notice_minutes, booking_horizon_days) values
  ('b0000000-0000-0000-0000-000000000070', 'stage7-barbers', 'Stage 7 Barbers', 'Europe/Kyiv', 30, 60, 60);

insert into public.staff (id, business_id, display_name) values
  ('51000000-0000-0000-0000-000000000071', 'b0000000-0000-0000-0000-000000000070', 'Andriy'),
  ('51000000-0000-0000-0000-000000000072', 'b0000000-0000-0000-0000-000000000070', 'Marta');

insert into public.services (id, business_id, name, duration_min, buffer_min, price_cents) values
  ('5e100000-0000-0000-0000-000000000071', 'b0000000-0000-0000-0000-000000000070', 'Haircut', 30, 0, 3500);

insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000070', '51000000-0000-0000-0000-000000000071', '5e100000-0000-0000-0000-000000000071'),
  ('b0000000-0000-0000-0000-000000000070', '51000000-0000-0000-0000-000000000072', '5e100000-0000-0000-0000-000000000071');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
select 'b0000000-0000-0000-0000-000000000070', s.id, wd, '09:00', '16:00'
from public.staff s cross join generate_series(1, 7) wd
where s.business_id = 'b0000000-0000-0000-0000-000000000070';

create function pg_temp.slot(day_offset int, local_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/Kyiv')::date + day_offset) + local_time) at time zone 'Europe/Kyiv';
$$;

create table pg_temp.booked (
  booking_id uuid,
  staff_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  manage_token text
);
grant all on pg_temp.booked to anon;

set local role anon;

-- 1. Trimmed notes persisted
insert into pg_temp.booked
select * from public.create_booking(
  'b0000000-0000-0000-0000-000000000070',
  '5e100000-0000-0000-0000-000000000071',
  '51000000-0000-0000-0000-000000000071',
  pg_temp.slot(2, '09:00'),
  'Olena Notes',
  'notes@example.test',
  '+380501112233',
  'Europe/Kyiv',
  '  Low fade on the sides  '
);

reset role;
select is(
  (select b.notes from public.bookings b where b.customer_email = 'notes@example.test'),
  'Low fade on the sides',
  'create_booking trims and stores p_notes'
);

-- 2. Whitespace-only notes become null
set local role anon;
insert into pg_temp.booked
select * from public.create_booking(
  'b0000000-0000-0000-0000-000000000070',
  '5e100000-0000-0000-0000-000000000071',
  '51000000-0000-0000-0000-000000000071',
  pg_temp.slot(2, '09:30'),
  'Blank Notes',
  'blank@example.test',
  null,
  'Europe/Kyiv',
  '    '
);
reset role;
select is(
  (select b.notes from public.bookings b where b.customer_email = 'blank@example.test'),
  null,
  'create_booking normalizes whitespace-only p_notes to null'
);

-- 3. Notes over 1000 chars fail check constraint
set local role anon;
select throws_ok(
  format(
    $$select * from public.create_booking(
      'b0000000-0000-0000-0000-000000000070',
      '5e100000-0000-0000-0000-000000000071',
      '51000000-0000-0000-0000-000000000071',
      pg_temp.slot(2, '10:00'),
      'Long Notes',
      'long@example.test',
      null,
      null,
      %L
    )$$,
    repeat('a', 1001)
  ),
  '23514',
  null,
  'create_booking rejects p_notes longer than 1000 characters'
);

-- 4. Legacy 6-argument call still succeeds with notes is null
insert into pg_temp.booked
select * from public.create_booking(
  'b0000000-0000-0000-0000-000000000070',
  '5e100000-0000-0000-0000-000000000071',
  null,
  pg_temp.slot(2, '10:30'),
  'Legacy Six',
  'legacy6@example.test'
);
reset role;
select is(
  (select b.notes from public.bookings b where b.customer_email = 'legacy6@example.test'),
  null,
  'legacy 6-argument create_booking call succeeds with null notes'
);

-- 5. Rate limit: 5 confirmed bookings allowed in 10 min for same email, 6th rejected
set local role anon;
insert into pg_temp.booked select * from public.create_booking('b0000000-0000-0000-0000-000000000070', '5e100000-0000-0000-0000-000000000071', '51000000-0000-0000-0000-000000000072', pg_temp.slot(2, '11:00'), 'Repeat 1', 'Repeat@Example.test');
insert into pg_temp.booked select * from public.create_booking('b0000000-0000-0000-0000-000000000070', '5e100000-0000-0000-0000-000000000071', '51000000-0000-0000-0000-000000000072', pg_temp.slot(2, '11:30'), 'Repeat 2', 'repeat@example.test');
insert into pg_temp.booked select * from public.create_booking('b0000000-0000-0000-0000-000000000070', '5e100000-0000-0000-0000-000000000071', '51000000-0000-0000-0000-000000000072', pg_temp.slot(2, '12:00'), 'Repeat 3', '  repeat@example.test  ');
insert into pg_temp.booked select * from public.create_booking('b0000000-0000-0000-0000-000000000070', '5e100000-0000-0000-0000-000000000071', '51000000-0000-0000-0000-000000000072', pg_temp.slot(2, '12:30'), 'Repeat 4', 'repeat@example.test');
insert into pg_temp.booked select * from public.create_booking('b0000000-0000-0000-0000-000000000070', '5e100000-0000-0000-0000-000000000071', '51000000-0000-0000-0000-000000000072', pg_temp.slot(2, '13:00'), 'Repeat 5', 'repeat@example.test');

select throws_ok(
  $$select * from public.create_booking(
    'b0000000-0000-0000-0000-000000000070',
    '5e100000-0000-0000-0000-000000000071',
    '51000000-0000-0000-0000-000000000072',
    pg_temp.slot(2, '13:30'),
    'Repeat 6',
    'REPEAT@example.test'
  )$$,
  'P0001',
  'rate_limit_exceeded',
  '6th booking within 10 minutes for the same normalized email is rejected'
);

-- 6. A different email for the same business is still allowed
select is(
  (select count(*)::int from public.create_booking(
    'b0000000-0000-0000-0000-000000000070',
    '5e100000-0000-0000-0000-000000000071',
    '51000000-0000-0000-0000-000000000072',
    pg_temp.slot(2, '14:00'),
    'Other Customer',
    'other@example.test'
  )),
  1,
  'rate limit is scoped per normalized email so another customer can book'
);

reset role;

select * from finish();

rollback;
