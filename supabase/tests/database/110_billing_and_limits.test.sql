begin;

select plan(27);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000111', 'owner11@example.test'),
  ('a0000000-0000-0000-0000-000000000112', 'manager11@example.test'),
  ('a0000000-0000-0000-0000-000000000113', 'andriy11@example.test'),
  ('a0000000-0000-0000-0000-000000000114', 'invitee11@example.test'),
  ('a0000000-0000-0000-0000-000000000115', 'outsider11@example.test');

insert into public.businesses (id, slug, name, timezone, slot_step_minutes, min_notice_minutes, booking_horizon_days, cancellation_deadline_hours) values
  ('b0000000-0000-0000-0000-000000000110', 'stage11-barbers', 'Stage 11 Barbers', 'Europe/Kyiv', 15, 0, 365, 24);

insert into public.business_members (business_id, user_id, role) values
  ('b0000000-0000-0000-0000-000000000110', 'a0000000-0000-0000-0000-000000000111', 'owner'),
  ('b0000000-0000-0000-0000-000000000110', 'a0000000-0000-0000-0000-000000000112', 'manager'),
  ('b0000000-0000-0000-0000-000000000110', 'a0000000-0000-0000-0000-000000000113', 'staff');

insert into public.staff (id, business_id, member_user_id, display_name, is_active) values
  ('51000000-0000-0000-0000-000000000111', 'b0000000-0000-0000-0000-000000000110', 'a0000000-0000-0000-0000-000000000113', 'Andriy', true),
  ('51000000-0000-0000-0000-000000000112', 'b0000000-0000-0000-0000-000000000110', null, 'Marta', true);

insert into public.services (id, business_id, name, duration_min, buffer_min, price_cents, is_active) values
  ('5e100000-0000-0000-0000-000000000111', 'b0000000-0000-0000-0000-000000000110', 'Haircut', 30, 0, 3500, true);

insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000110', '51000000-0000-0000-0000-000000000111', '5e100000-0000-0000-0000-000000000111'),
  ('b0000000-0000-0000-0000-000000000110', '51000000-0000-0000-0000-000000000112', '5e100000-0000-0000-0000-000000000111');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
select 'b0000000-0000-0000-0000-000000000110', '51000000-0000-0000-0000-000000000111'::uuid, wd, '08:00', '20:00'
from generate_series(1, 7) wd;

insert into public.business_subscriptions (business_id, plan_tier, status, stripe_customer_id)
values ('b0000000-0000-0000-0000-000000000110', 'free', 'active', 'cus_secret_110');

create table pg_temp.vars (
  label text primary key,
  uid uuid,
  tok text,
  ts timestamptz
);
grant all on pg_temp.vars to anon, authenticated, service_role;

-- Choose next calendar month in Europe/Kyiv (within 365-day booking horizon and guaranteed non-overlapping slots).
insert into pg_temp.vars (label, ts)
values (
  'target_month_start',
  (date_trunc('month', now() at time zone 'Europe/Kyiv') + interval '1 month') at time zone 'Europe/Kyiv'
);

-- 1–3. Tables & RLS
select has_table('public', 'business_subscriptions', 'business_subscriptions table exists');
select has_table('public', 'stripe_events', 'stripe_events table exists');
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every public table including billing tables'
);

-- 4–10. Privilege & RLS boundaries on business_subscriptions and stripe_events
set local role anon;
select throws_ok(
  $$select count(*) from public.business_subscriptions$$,
  '42501', null,
  'anon has no access to business_subscriptions'
);
select throws_ok(
  $$select count(*) from public.stripe_events$$,
  '42501', null,
  'anon has no access to stripe_events'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000111","role":"authenticated"}';
select throws_ok(
  $$select count(*) from public.stripe_events$$,
  '42501', null,
  'authenticated owner cannot access stripe_events'
);
select throws_ok(
  $$select stripe_customer_id from public.business_subscriptions limit 1$$,
  '42501', null,
  'authenticated owner cannot select stripe_customer_id directly'
);
select throws_ok(
  $$update public.business_subscriptions set plan_tier = 'pro' where business_id = 'b0000000-0000-0000-0000-000000000110'$$,
  '42501', null,
  'authenticated owner cannot update own subscription directly'
);
select is(
  (select row(plan_tier::text, status::text, cancel_at_period_end)::text
   from public.business_subscriptions
   where business_id = 'b0000000-0000-0000-0000-000000000110'),
  row('free', 'active', false)::text,
  'business member sees non-secret columns of own subscription'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000115","role":"authenticated"}';
select is(
  (select count(*)::int from public.business_subscriptions where business_id = 'b0000000-0000-0000-0000-000000000110'),
  0,
  'outsider sees zero business_subscriptions rows'
);

-- 11–14. Free staff limit (3 active) + open invite check
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000111","role":"authenticated"}';
select lives_ok(
  $$insert into public.staff (id, business_id, display_name, is_active)
    values ('51000000-0000-0000-0000-000000000113', 'b0000000-0000-0000-0000-000000000110', 'Sam', true)$$,
  'free plan allows adding a 3rd active staff member'
);

select throws_ok(
  $$insert into public.staff (business_id, display_name, is_active)
    values ('b0000000-0000-0000-0000-000000000110', 'Elena', true)$$,
  'P0001', 'plan_limit_staff',
  'free plan blocks adding a 4th active staff member'
);

select lives_ok(
  $$insert into public.staff (id, business_id, display_name, is_active)
    values ('51000000-0000-0000-0000-000000000114', 'b0000000-0000-0000-0000-000000000110', 'Paused Chair', false)$$,
  'free plan permits inserting an inactive staff profile when 3 are active'
);

-- Open staff invite creation + acceptance hits plan_limit_staff when 3 chairs are active
with inv as (
  select * from public.create_business_invitation(
    'b0000000-0000-0000-0000-000000000110',
    'staff'::public.member_role,
    null
  )
)
insert into pg_temp.vars (label, tok)
select 'open_invite', inv.token from inv;

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000114","role":"authenticated"}';
select throws_ok(
  $$select * from public.accept_business_invitation((select tok from pg_temp.vars where label = 'open_invite'), 'Elena')$$,
  'P0001', 'plan_limit_staff',
  'accepting an open staff invite enforces the free 3-staff active limit'
);
reset role;

-- Re-activating paused chair while 3 active exist also fails
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000111","role":"authenticated"}';
select throws_ok(
  $$update public.staff set is_active = true where id = '51000000-0000-0000-0000-000000000114'$$,
  'P0001', 'plan_limit_staff',
  'activating a paused staff member beyond 3 active is rejected on free plan'
);

-- 15–17. Free service limit (5 active)
insert into public.services (id, business_id, name, duration_min, is_active) values
  ('5e100000-0000-0000-0000-000000000112', 'b0000000-0000-0000-0000-000000000110', 'Service 2', 20, true),
  ('5e100000-0000-0000-0000-000000000113', 'b0000000-0000-0000-0000-000000000110', 'Service 3', 20, true),
  ('5e100000-0000-0000-0000-000000000114', 'b0000000-0000-0000-0000-000000000110', 'Service 4', 20, true),
  ('5e100000-0000-0000-0000-000000000115', 'b0000000-0000-0000-0000-000000000110', 'Service 5', 20, true);

select throws_ok(
  $$insert into public.services (business_id, name, duration_min, is_active)
    values ('b0000000-0000-0000-0000-000000000110', 'Service 6', 20, true)$$,
  'P0001', 'plan_limit_services',
  'free plan blocks adding a 6th active service'
);

update public.services set is_active = false where id = '5e100000-0000-0000-0000-000000000115';
select lives_ok(
  $$insert into public.services (id, business_id, name, duration_min, is_active)
    values ('5e100000-0000-0000-0000-000000000116', 'b0000000-0000-0000-0000-000000000110', 'Service Replacement', 20, true)$$,
  'pausing a service frees a slot under the free 5-service cap'
);

select throws_ok(
  $$update public.services set is_active = true where id = '5e100000-0000-0000-0000-000000000115'$$,
  'P0001', 'plan_limit_services',
  're-activating a paused 6th service is rejected on free plan'
);
reset role;

-- 18–20. Free monthly booking limit (100 non-cancelled bookings/month in business timezone)
-- Seed 100 confirmed bookings across days 1..20 (5 slots per day) + 1 cancelled booking in target month.
insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, status, customer_name, customer_email)
select
  'b0000000-0000-0000-0000-000000000110',
  '51000000-0000-0000-0000-000000000111',
  '5e100000-0000-0000-0000-000000000111',
  (select ts from pg_temp.vars where label = 'target_month_start') + make_interval(days => (i - 1) / 5, hours => 9 + ((i - 1) % 5) * 2),
  (select ts from pg_temp.vars where label = 'target_month_start') + make_interval(days => (i - 1) / 5, hours => 9 + ((i - 1) % 5) * 2, mins => 30),
  (select ts from pg_temp.vars where label = 'target_month_start') + make_interval(days => (i - 1) / 5, hours => 9 + ((i - 1) % 5) * 2, mins => 30),
  'confirmed',
  'Quota Client ' || i::text,
  'quota' || i::text || '@example.test'
from generate_series(1, 100) i;

insert into public.bookings (business_id, staff_id, service_id, starts_at, ends_at, blocked_until, status, customer_name, customer_email)
values (
  'b0000000-0000-0000-0000-000000000110',
  '51000000-0000-0000-0000-000000000111',
  '5e100000-0000-0000-0000-000000000111',
  (select ts from pg_temp.vars where label = 'target_month_start') + interval '21 days 09:00',
  (select ts from pg_temp.vars where label = 'target_month_start') + interval '21 days 09:30',
  (select ts from pg_temp.vars where label = 'target_month_start') + interval '21 days 09:30',
  'cancelled',
  'Cancelled Exempt',
  'cancelled@example.test'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000112","role":"authenticated"}';
select throws_ok(
  $$select * from public.create_manual_booking(
      'b0000000-0000-0000-0000-000000000110',
      '5e100000-0000-0000-0000-000000000111',
      '51000000-0000-0000-0000-000000000111',
      (select ts from pg_temp.vars where label = 'target_month_start') + interval '22 days 10:00',
      'Over Limit Client'
    )$$,
  'P0001', 'plan_limit_bookings',
  '101st booking in the same month is rejected on free plan even when a cancelled booking exists'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.create_booking(
      'b0000000-0000-0000-0000-000000000110',
      '5e100000-0000-0000-0000-000000000111',
      '51000000-0000-0000-0000-000000000111',
      (select ts from pg_temp.vars where label = 'target_month_start') + interval '22 days 11:00',
      'Public Blocked',
      'public-blocked@example.test'
    )$$,
  'P0001', 'plan_limit_bookings',
  'public create_booking enforces the 100/month limit on free plan'
);

select lives_ok(
  $$select * from public.create_booking(
      'b0000000-0000-0000-0000-000000000110',
      '5e100000-0000-0000-0000-000000000111',
      '51000000-0000-0000-0000-000000000111',
      (select ts from pg_temp.vars where label = 'target_month_start') + interval '35 days 10:00',
      'Next Month Client',
      'nextmonth@example.test'
    )$$,
  'bookings in the next calendar month remain allowed on free plan'
);
reset role;

-- 21–24. Pro plan subscription unlocks unlimited services & bookings and raises staff cap to 10
set local role service_role;
update public.business_subscriptions
set plan_tier = 'pro',
    status = 'active',
    stripe_subscription_id = 'sub_110_active',
    stripe_price_id = 'price_pro_test'
where business_id = 'b0000000-0000-0000-0000-000000000110';
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000111","role":"authenticated"}';
select lives_ok(
  $$insert into public.services (id, business_id, name, duration_min, is_active)
    values ('5e100000-0000-0000-0000-000000000117', 'b0000000-0000-0000-0000-000000000110', 'Pro Unlimited Service', 30, true)$$,
  'pro plan allows adding beyond 5 active services'
);

select lives_ok(
  $$select * from public.create_manual_booking(
      'b0000000-0000-0000-0000-000000000110',
      '5e100000-0000-0000-0000-000000000111',
      '51000000-0000-0000-0000-000000000111',
      (select ts from pg_temp.vars where label = 'target_month_start') + interval '22 days 12:00',
      'Pro 101st Booking'
    )$$,
  'pro plan unlocks more than 100 bookings per month'
);

insert into public.staff (business_id, display_name, is_active)
select 'b0000000-0000-0000-0000-000000000110', 'Pro Chair ' || i::text, true
from generate_series(4, 10) i;

select throws_ok(
  $$insert into public.staff (business_id, display_name, is_active)
    values ('b0000000-0000-0000-0000-000000000110', 'Pro Chair 11', true)$$,
  'P0001', 'plan_limit_staff',
  'pro plan enforces its 10 active staff cap'
);

-- 25–26. get_business_plan_usage RPC + downgrade restoration of limits
select is(
  (select row(
     u.plan_tier::text,
     u.subscription_status::text,
     u.has_stripe_customer,
     u.active_staff_count,
     u.max_staff,
     u.active_services_count,
     u.max_services is null,
     u.max_monthly_bookings is null
   )::text
   from public.get_business_plan_usage('b0000000-0000-0000-0000-000000000110') u),
  row('pro', 'active', true, 10, 10, 6, true, true)::text,
  'get_business_plan_usage reports accurate Pro usage and unlimited nulls'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000115","role":"authenticated"}';
select throws_ok(
  $$select * from public.get_business_plan_usage('b0000000-0000-0000-0000-000000000110')$$,
  '42501', null,
  'outsider cannot query get_business_plan_usage'
);
reset role;

-- 27. Downgrading/canceling subscription restores Free plan limits immediately
set local role service_role;
update public.business_subscriptions
set status = 'canceled'
where business_id = 'b0000000-0000-0000-0000-000000000110';
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000111","role":"authenticated"}';
select throws_ok(
  $$insert into public.services (business_id, name, duration_min, is_active)
    values ('b0000000-0000-0000-0000-000000000110', 'After Cancel Service', 20, true)$$,
  'P0001', 'plan_limit_services',
  'canceling Pro restores Free plan service limits immediately'
);
reset role;

select * from finish();

rollback;
