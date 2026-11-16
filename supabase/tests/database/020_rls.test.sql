begin;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures (as the test superuser)
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'manager@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'staff-a@example.test'),
  ('a0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'staff-b@example.test'),
  ('a0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'outsider@example.test');

insert into public.businesses (id, slug, name, timezone) values
  ('b0000000-0000-0000-0000-000000000001', 'north-barbers', 'North Barbers', 'Europe/Kyiv'),
  ('b0000000-0000-0000-0000-000000000002', 'south-cuts', 'South Cuts', 'America/New_York');

insert into public.business_members (business_id, user_id, role) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'manager'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'staff'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'staff'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'owner');

insert into public.staff (id, business_id, member_user_id, display_name, is_active) values
  ('51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Andriy', true),
  ('51000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Marta', true),
  ('51000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', null, 'Former Barber', false),
  ('52000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'Sam', true);

insert into public.services (id, business_id, name, duration_min, buffer_min, is_active) values
  ('5e100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Haircut', 30, 10, true),
  ('5e100000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Retired service', 30, 0, false),
  ('5e200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Fade', 45, 0, true);

insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 1, '09:00', '18:00');

insert into public.time_off (business_id, staff_id, period, reason) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '[2030-02-01 00:00+00, 2030-02-08 00:00+00)', 'Vacation');

insert into public.bookings (id, business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
   '2030-01-10 10:00+00', '2030-01-10 10:30+00', '2030-01-10 10:40+00', 'Customer A', 'a@example.test'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001',
   '2030-01-10 10:00+00', '2030-01-10 10:30+00', '2030-01-10 10:40+00', 'Customer B', 'b@example.test'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', '5e200000-0000-0000-0000-000000000001',
   '2030-01-10 15:00+00', '2030-01-10 15:45+00', '2030-01-10 15:45+00', 'Customer C', 'c@example.test');

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select is((select count(*)::int from public.businesses where not is_demo), 2, 'anon sees public business profiles');
select is(
  (select count(*)::int from public.staff where business_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')),
  3,
  'anon sees active staff only'
);
select is(
  (select count(*)::int from public.services where business_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')),
  2,
  'anon sees active services only'
);
-- No table privilege at all for anon on private data: permission denied, not just zero rows.
select throws_ok($$select count(*) from public.bookings$$, '42501', null, 'anon has no access to bookings');
select throws_ok($$select count(*) from public.business_members$$, '42501', null, 'anon has no access to members');
select throws_ok($$select count(*) from public.weekly_hours$$, '42501', null, 'anon has no access to working hours');
select throws_ok($$select count(*) from public.time_off$$, '42501', null, 'anon has no access to time off');
select throws_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
            '2030-01-11 10:00+00', '2030-01-11 10:30+00', '2030-01-11 10:40+00', 'Anon', 'anon@example.test')$$,
  '42501', null, 'anon cannot insert bookings directly'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner of North Barbers
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.bookings), 2, 'owner sees all bookings of own business and none elsewhere');
select isnt_empty(
  $$update public.businesses set min_notice_minutes = 30 where id = 'b0000000-0000-0000-0000-000000000001' returning 1$$,
  'owner can change own business settings'
);
select is_empty(
  $$update public.businesses set min_notice_minutes = 30 where id = 'b0000000-0000-0000-0000-000000000002' returning 1$$,
  'owner cannot change another business'
);
select lives_ok(
  $$insert into public.services (business_id, name, duration_min) values ('b0000000-0000-0000-0000-000000000001', 'Beard trim', 20)$$,
  'owner can add a service'
);
select throws_ok(
  $$insert into public.services (business_id, name, duration_min) values ('b0000000-0000-0000-0000-000000000002', 'Intrusion', 20)$$,
  '42501', null, 'owner cannot add a service to another business'
);
select is(
  (select count(*)::int from public.services where business_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')),
  4,
  'owner sees inactive services of own business too'
);

reset role;

-- ---------------------------------------------------------------------------
-- Manager of North Barbers
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.bookings), 2, 'manager sees all bookings of the business');
select is_empty(
  $$update public.businesses set min_notice_minutes = 5 where id = 'b0000000-0000-0000-0000-000000000001' returning 1$$,
  'manager cannot change business settings'
);
select lives_ok(
  $$insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 2, '10:00', '16:00')$$,
  'manager can set working hours for any staff'
);
select lives_ok(
  $$insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, customer_name, customer_email)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001',
            '2030-01-12 10:00+00', '2030-01-12 10:30+00', '2030-01-12 10:40+00', 'Walk-in', 'walkin@example.test')$$,
  'manager can create a booking for any staff'
);
select is_empty(
  $$update public.business_members set role = 'owner' where user_id = 'a0000000-0000-0000-0000-000000000002' returning 1$$,
  'manager cannot promote themselves'
);

reset role;

-- ---------------------------------------------------------------------------
-- Staff member Andriy (staff role)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is((select count(*)::int from public.bookings), 1, 'staff sees only own bookings');
select is((select count(*)::int from public.business_members), 4, 'staff sees the member list of own business');
select lives_ok(
  $$insert into public.time_off (business_id, staff_id, period)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '[2030-03-01 00:00+00, 2030-03-02 00:00+00)')$$,
  'staff can add own time off'
);
select throws_ok(
  $$insert into public.time_off (business_id, staff_id, period)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '[2030-03-01 00:00+00, 2030-03-02 00:00+00)')$$,
  '42501', null, 'staff cannot add time off for a colleague'
);
select throws_ok(
  $$insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
    values ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 3, '09:00', '12:00')$$,
  '42501', null, 'staff cannot change weekly hours'
);
select throws_ok(
  $$insert into public.services (business_id, name, duration_min) values ('b0000000-0000-0000-0000-000000000001', 'Rogue', 20)$$,
  '42501', null, 'staff cannot add services'
);
select isnt_empty(
  $$update public.bookings set status = 'completed' where id = 'b1000000-0000-0000-0000-000000000001' returning 1$$,
  'staff can update the status of own booking'
);
select is_empty(
  $$update public.bookings set status = 'completed' where id = 'b1000000-0000-0000-0000-000000000002' returning 1$$,
  'staff cannot update a colleague''s booking'
);
select throws_ok(
  $$update public.bookings set staff_id = '51000000-0000-0000-0000-000000000002' where id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'staff cannot hand own booking to a colleague'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner of another business
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is((select count(*)::int from public.bookings where business_id = 'b0000000-0000-0000-0000-000000000001'), 0,
  'an outsider sees no bookings of another business');
select is((select count(*)::int from public.business_members where business_id = 'b0000000-0000-0000-0000-000000000001'), 0,
  'an outsider sees no members of another business');
select is_empty(
  $$update public.staff set display_name = 'Hacked' where business_id = 'b0000000-0000-0000-0000-000000000001' returning 1$$,
  'an outsider cannot edit staff of another business'
);

reset role;

select * from finish();

rollback;
