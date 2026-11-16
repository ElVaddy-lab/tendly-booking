begin;

select plan(28);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000101', 'owner10@example.test'),
  ('a0000000-0000-0000-0000-000000000102', 'manager10@example.test'),
  ('a0000000-0000-0000-0000-000000000103', 'andriy10@example.test'),
  ('a0000000-0000-0000-0000-000000000104', 'marta10@example.test'),
  ('a0000000-0000-0000-0000-000000000105', 'outsider10@example.test');

insert into public.businesses (id, slug, name, timezone, slot_step_minutes, min_notice_minutes, booking_horizon_days, cancellation_deadline_hours) values
  ('b0000000-0000-0000-0000-000000000100', 'stage10-barbers', 'Stage 10 Barbers', 'Europe/Kyiv', 15, 60, 365, 24);

insert into public.business_members (business_id, user_id, role) values
  ('b0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000101', 'owner'),
  ('b0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000102', 'manager'),
  ('b0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000103', 'staff'),
  ('b0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000104', 'staff');

insert into public.staff (id, business_id, member_user_id, display_name, is_active) values
  ('51000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000103', 'Andriy', true),
  ('51000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000100', 'a0000000-0000-0000-0000-000000000104', 'Marta', true);

insert into public.services (id, business_id, name, duration_min, buffer_min, price_cents, is_active) values
  ('5e100000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000100', 'Haircut', 30, 10, 3500, true);

insert into public.staff_services (business_id, staff_id, service_id) values
  ('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000101', '5e100000-0000-0000-0000-000000000101'),
  ('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000102', '5e100000-0000-0000-0000-000000000101');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
select 'b0000000-0000-0000-0000-000000000100', st.id, wd, '09:00', '18:00'
from (values ('51000000-0000-0000-0000-000000000101'::uuid), ('51000000-0000-0000-0000-000000000102'::uuid)) st(id)
cross join generate_series(1, 7) wd;

create table pg_temp.state (
  label text primary key,
  val text,
  uid uuid,
  ts timestamptz
);
grant all on pg_temp.state to anon, authenticated, service_role;

-- 1–2. Outbox exists and RLS enabled on every public table
select has_table('public', 'notification_outbox', 'notification_outbox table exists');
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every public table including notification_outbox'
);

-- 3–7. Privilege isolation on notification_outbox and sensitive staff columns
set local role anon;
select throws_ok(
  $$select count(*) from public.notification_outbox$$,
  '42501', null,
  'anon has no select access on notification_outbox'
);
select throws_ok(
  $$select telegram_chat_id from public.staff limit 1$$,
  '42501', null,
  'anon cannot select telegram_chat_id from staff'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000103","role":"authenticated"}';
select throws_ok(
  $$select telegram_chat_id from public.staff limit 1$$,
  '42501', null,
  'authenticated cannot select telegram_chat_id directly from staff'
);
select throws_ok(
  $$select ics_token_hash, telegram_link_code_hash from public.staff limit 1$$,
  '42501', null,
  'authenticated cannot select token hashes from staff'
);
select lives_ok(
  $$select id, display_name, telegram_linked_at, ics_enabled_at from public.staff where business_id = 'b0000000-0000-0000-0000-000000000100'$$,
  'authenticated can select non-secret link metadata from staff'
);
reset role;

-- 8–12. create_telegram_link_code RBAC + code issuance
set local role anon;
select throws_ok(
  $$select * from public.create_telegram_link_code('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000101')$$,
  '42501', null,
  'anon cannot call create_telegram_link_code'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000105","role":"authenticated"}';
select throws_ok(
  $$select * from public.create_telegram_link_code('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000101')$$,
  '42501', null,
  'outsider cannot create telegram link code for another business'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000103","role":"authenticated"}';
select throws_ok(
  $$select * from public.create_telegram_link_code('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000102')$$,
  '42501', null,
  'staff member cannot create telegram link code for colleague'
);

with res as (
  select * from public.create_telegram_link_code(
    'b0000000-0000-0000-0000-000000000100',
    '51000000-0000-0000-0000-000000000101'
  )
)
insert into pg_temp.state (label, val, ts)
select 'andriy_code', res.link_code, res.expires_at from res;

select ok(
  exists (
    select 1 from pg_temp.state
    where label = 'andriy_code' and val ~ '^[0-9a-f]{32}$' and ts > now()
  ),
  'staff member creates a 32-char hex telegram link code for own profile'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000102","role":"authenticated"}';
with res as (
  select * from public.create_telegram_link_code(
    'b0000000-0000-0000-0000-000000000100',
    '51000000-0000-0000-0000-000000000102'
  )
)
insert into pg_temp.state (label, val, ts)
select 'marta_code', res.link_code, res.expires_at from res;

select ok(
  exists (
    select 1 from pg_temp.state
    where label = 'marta_code' and val ~ '^[0-9a-f]{32}$'
  ),
  'manager creates telegram link code for any business staff member'
);
reset role;

-- 13–16. complete_telegram_link restricted to service_role and single-use
set local role anon;
select throws_ok(
  $$select * from public.complete_telegram_link((select val from pg_temp.state where label = 'andriy_code'), 9001001)$$,
  '42501', null,
  'anon cannot execute complete_telegram_link'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000101","role":"authenticated"}';
select throws_ok(
  $$select * from public.complete_telegram_link((select val from pg_temp.state where label = 'andriy_code'), 9001001)$$,
  '42501', null,
  'authenticated owner cannot execute service-only complete_telegram_link'
);
reset role;

set local role service_role;
select is(
  (select row(r.staff_id, r.business_id, r.staff_name)::text
   from public.complete_telegram_link((select val from pg_temp.state where label = 'andriy_code'), 9001001) r),
  row('51000000-0000-0000-0000-000000000101'::uuid, 'b0000000-0000-0000-0000-000000000100'::uuid, 'Andriy')::text,
  'service_role completes telegram link for Andriy'
);

select throws_ok(
  $$select * from public.complete_telegram_link((select val from pg_temp.state where label = 'andriy_code'), 9001099)$$,
  'P0001', 'invalid_or_expired_link_code',
  'consumed telegram link code cannot be reused'
);

-- Link Marta too for trigger + RLS multi-staff outbox tests
select public.complete_telegram_link((select val from pg_temp.state where label = 'marta_code'), 9001002);
reset role;

-- 17–19. Triggers enqueue booking_created, booking_rescheduled, booking_cancelled
set local role anon;
with b1 as (
  select * from public.create_booking(
    'b0000000-0000-0000-0000-000000000100',
    '5e100000-0000-0000-0000-000000000101',
    '51000000-0000-0000-0000-000000000101',
    ((current_date + 3) + time '10:00') at time zone 'Europe/Kyiv',
    'Public Guest',
    'guest10@example.test',
    null,
    'Europe/Kyiv',
    'Short trim'
  )
)
insert into pg_temp.state (label, val, uid)
select 'pub_booking', b1.manage_token, b1.booking_id from b1;
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000102","role":"authenticated"}';
with b2 as (
  select * from public.create_manual_booking(
    'b0000000-0000-0000-0000-000000000100',
    '5e100000-0000-0000-0000-000000000101',
    '51000000-0000-0000-0000-000000000102',
    ((current_date + 3) + time '12:00') at time zone 'Europe/Kyiv',
    'Marta Walkin',
    null
  )
)
insert into pg_temp.state (label, val, uid)
select 'marta_booking', b2.manage_token, b2.booking_id from b2;
reset role;

select is(
  (select count(*)::int from public.notification_outbox
   where business_id = 'b0000000-0000-0000-0000-000000000100'
     and event_type = 'booking_created'
     and status = 'pending'),
  2,
  'booking_created outbox rows are enqueued for linked specialists'
);

set local role anon;
select public.reschedule_booking(
  (select val from pg_temp.state where label = 'pub_booking'),
  '51000000-0000-0000-0000-000000000101',
  ((current_date + 3) + time '11:00') at time zone 'Europe/Kyiv'
);
reset role;

select is(
  (select count(*)::int from public.notification_outbox
   where business_id = 'b0000000-0000-0000-0000-000000000100'
     and event_type = 'booking_rescheduled'
     and status = 'pending'),
  1,
  'reschedule_booking enqueues a booking_rescheduled notification'
);

set local role anon;
select public.cancel_booking((select val from pg_temp.state where label = 'pub_booking'));
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000102","role":"authenticated"}';
select public.update_booking_status(
  'b0000000-0000-0000-0000-000000000100',
  (select uid from pg_temp.state where label = 'marta_booking'),
  'cancelled'
);
reset role;

select is(
  (select count(*)::int from public.notification_outbox
   where business_id = 'b0000000-0000-0000-0000-000000000100'
     and event_type = 'booking_cancelled'
     and status = 'pending'),
  2,
  'cancel_booking and update_booking_status cancel enqueue booking_cancelled notifications'
);

-- 20–21. notification_outbox RLS visibility
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000103","role":"authenticated"}';
select is(
  (select count(*)::int from public.notification_outbox where business_id = 'b0000000-0000-0000-0000-000000000100'),
  3,
  'staff Andriy sees only own 3 outbox notifications through RLS'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000102","role":"authenticated"}';
select is(
  (select count(*)::int from public.notification_outbox where business_id = 'b0000000-0000-0000-0000-000000000100'),
  5,
  'manager sees all 5 business outbox notifications'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000105","role":"authenticated"}';
select is(
  (select count(*)::int from public.notification_outbox where business_id = 'b0000000-0000-0000-0000-000000000100'),
  0,
  'outsider sees zero outbox notifications'
);
reset role;

-- 22–23. Daily staff reminders digest RBAC and idempotency
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000101","role":"authenticated"}';
select throws_ok(
  $$select public.enqueue_daily_staff_reminders(now())$$,
  '42501', null,
  'authenticated owner cannot call service-only enqueue_daily_staff_reminders'
);

-- Add 2 confirmed bookings for Andriy on 2029-06-15 local Kyiv time
with d1 as (
  select * from public.create_manual_booking(
    'b0000000-0000-0000-0000-000000000100',
    '5e100000-0000-0000-0000-000000000101',
    '51000000-0000-0000-0000-000000000101',
    '2029-06-15 10:00+03'::timestamptz,
    'Digest Morning',
    'morn@example.test',
    null,
    'Sensitive intake note'
  )
),
d2 as (
  select * from public.create_manual_booking(
    'b0000000-0000-0000-0000-000000000100',
    '5e100000-0000-0000-0000-000000000101',
    '51000000-0000-0000-0000-000000000101',
    '2029-06-15 14:00+03'::timestamptz,
    'Digest Afternoon',
    'aft@example.test',
    null,
    'Afternoon note'
  )
)
insert into pg_temp.state (label, uid)
select 'digest_completed', d1.booking_id from d1
union all
select 'digest_confirmed', d2.booking_id from d2;
reset role;

set local role service_role;
select is(
  row(
    public.enqueue_daily_staff_reminders('2029-06-15 07:00+03'::timestamptz),
    public.enqueue_daily_staff_reminders('2029-06-15 07:15+03'::timestamptz)
  )::text,
  row(1, 0)::text,
  'enqueue_daily_staff_reminders creates 1 digest for the local day and deduplicates repeats'
);
reset role;

-- 24. Unlinking Telegram clears chat metadata and pending unsent rows
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000103","role":"authenticated"}';
select public.unlink_staff_telegram('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000101');
reset role;

select is(
  row(
    (select telegram_chat_id is null and telegram_linked_at is null from public.staff where id = '51000000-0000-0000-0000-000000000101'),
    (select count(*)::int from public.notification_outbox where staff_id = '51000000-0000-0000-0000-000000000101' and status = 'pending')
  )::text,
  row(true, 0)::text,
  'unlink_staff_telegram clears staff telegram link and removes pending outbox items'
);

-- 25–27. Staff .ics calendar feed RBAC, privacy masking on erased bookings, and revocation
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000103","role":"authenticated"}';
select throws_ok(
  $$select * from public.rotate_staff_ics_token('b0000000-0000-0000-0000-000000000100', '51000000-0000-0000-0000-000000000102')$$,
  '42501', null,
  'staff member cannot rotate colleague .ics feed token'
);

with rot as (
  select * from public.rotate_staff_ics_token(
    'b0000000-0000-0000-0000-000000000100',
    '51000000-0000-0000-0000-000000000101'
  )
)
insert into pg_temp.state (label, val)
select 'andriy_ics', rot.ics_token from rot;

-- Complete the morning booking then owner erases its PII to test feed redaction alongside active confirmed booking
select public.update_booking_status(
  'b0000000-0000-0000-0000-000000000100',
  (select uid from pg_temp.state where label = 'digest_completed'),
  'completed'
);

set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000101","role":"authenticated"}';
select public.erase_booking_customer_data(
  'b0000000-0000-0000-0000-000000000100',
  (select uid from pg_temp.state where label = 'digest_completed')
);
reset role;

set local role anon;
select is(
  (select string_agg(f.customer_name || ':' || coalesce(f.notes, 'none'), '|' order by f.starts_at)
   from public.get_staff_calendar_feed((select val from pg_temp.state where label = 'andriy_ics')) f
   where f.booking_id is not null),
  'Client:none|Digest Afternoon:Afternoon note',
  'get_staff_calendar_feed returns non-cancelled bookings and masks erased client PII'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000103","role":"authenticated"}';
select public.revoke_staff_ics_token(
  'b0000000-0000-0000-0000-000000000100',
  '51000000-0000-0000-0000-000000000101'
);
reset role;

set local role anon;
select is(
  (select count(*)::int from public.get_staff_calendar_feed((select val from pg_temp.state where label = 'andriy_ics'))),
  0,
  'revoked .ics feed token returns 0 rows'
);
reset role;

select * from finish();

rollback;
