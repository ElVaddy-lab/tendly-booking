begin;

select plan(18);

-- Tables
select has_table('public', 'businesses', 'businesses table exists');
select has_table('public', 'business_members', 'business_members table exists');
select has_table('public', 'staff', 'staff table exists');
select has_table('public', 'services', 'services table exists');
select has_table('public', 'staff_services', 'staff_services table exists');
select has_table('public', 'weekly_hours', 'weekly_hours table exists');
select has_table('public', 'time_off', 'time_off table exists');
select has_table('public', 'bookings', 'bookings table exists');

-- Every table in the exposed schema has RLS enabled
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every public table'
);

-- Fixtures (run as the test superuser, RLS bypassed)
insert into public.businesses (id, slug, name, timezone) values
  ('b0000000-0000-0000-0000-000000000001', 'north-barbers', 'North Barbers', 'Europe/Kyiv'),
  ('b0000000-0000-0000-0000-000000000002', 'south-cuts', 'South Cuts', 'America/New_York');

insert into public.staff (id, business_id, display_name) values
  ('51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Andriy'),
  ('51000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Marta'),
  ('52000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Sam');

insert into public.services (id, business_id, name, duration_min, buffer_min) values
  ('5e100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Haircut', 30, 10),
  ('5e200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Fade', 45, 0);

select throws_ok(
  $$insert into public.businesses (slug, name, timezone) values ('bad-zone', 'Bad Zone', 'Mars/Olympus')$$,
  '23514',
  null,
  'an unknown IANA time zone is rejected'
);

-- A first confirmed booking for Andriy: 10:00–10:30 UTC, blocked until 10:40 (10 min buffer)
insert into public.bookings (id, business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
        '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
        '2030-01-10 10:00+00', '2030-01-10 10:30+00', '2030-01-10 10:40+00', 'Test Customer', 'one@example.test');

select throws_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-10 10:15+00', '2030-01-10 10:45+00', '2030-01-10 10:55+00', 'Second', 'two@example.test')$$,
  '23P01',
  null,
  'an overlapping booking for the same staff is rejected by the exclusion constraint'
);

select throws_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-10 10:35+00', '2030-01-10 11:05+00', '2030-01-10 11:15+00', 'Buffer', 'buffer@example.test')$$,
  '23P01',
  null,
  'a booking that starts inside the previous buffer is rejected'
);

select lives_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-10 10:40+00', '2030-01-10 11:10+00', '2030-01-10 11:20+00', 'Adjacent', 'adjacent@example.test')$$,
  'a booking that starts exactly when the buffer ends is allowed (half-open ranges)'
);

select lives_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001',
            '2030-01-10 10:00+00', '2030-01-10 10:30+00', '2030-01-10 10:40+00', 'Other staff', 'other@example.test')$$,
  'another staff member can be booked at the same time'
);

update public.bookings set status = 'cancelled' where id = 'b1000000-0000-0000-0000-000000000001';

select lives_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-10 10:00+00', '2030-01-10 10:30+00', '2030-01-10 10:40+00', 'Rebook', 'rebook@example.test')$$,
  'a cancelled booking frees its slot'
);

select throws_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-11 10:00+00', '2030-01-11 10:30+00', '2030-01-11 10:30+00', 'Cross', 'cross@example.test')$$,
  '23503',
  null,
  'a booking cannot reference staff of another business'
);

select throws_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-12 10:30+00', '2030-01-12 10:00+00', '2030-01-12 10:30+00', 'Backwards', 'back@example.test')$$,
  '23514',
  null,
  'a booking that ends before it starts is rejected'
);

select throws_ok(
  $$insert into public.staff_services (business_id, staff_id, service_id)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e200000-0000-0000-0000-000000000001')$$,
  '23503',
  null,
  'staff cannot offer a service of another business'
);

select * from finish();

rollback;
