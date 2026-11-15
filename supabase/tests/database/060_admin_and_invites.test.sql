begin;

select plan(32);

-- ---------------------------------------------------------------------------
-- Schema, RLS and function existence
-- ---------------------------------------------------------------------------
select has_table('public', 'business_invitations', 'business_invitations table exists');
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every public table including business_invitations'
);
select has_function(
  'public', 'set_staff_weekly_hours', array['uuid', 'uuid', 'jsonb'],
  'public.set_staff_weekly_hours exists'
);
select has_function(
  'public', 'create_business_invitation', array['uuid', 'public.member_role', 'uuid'],
  'public.create_business_invitation exists'
);
select has_function(
  'public', 'get_business_invitation', array['text'],
  'public.get_business_invitation exists'
);
select has_function(
  'public', 'accept_business_invitation', array['text', 'text'],
  'public.accept_business_invitation exists'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'manager@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'staff@example.test'),
  ('a0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'invitee-staff@example.test'),
  ('a0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'invitee-mgr@example.test'),
  ('a0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'outsider@example.test'),
  ('a0000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'invitee-newstaff@example.test');

insert into public.businesses (id, slug, name, timezone) values
  ('b0000000-0000-0000-0000-000000000001', 'north-barbers', 'North Barbers', 'Europe/Kyiv'),
  ('b0000000-0000-0000-0000-000000000002', 'south-cuts', 'South Cuts', 'America/New_York');

insert into public.business_members (business_id, user_id, role) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'manager'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'staff'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'owner');

insert into public.staff (id, business_id, member_user_id, display_name) values
  ('51000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Andriy'),
  ('51000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', null, 'Marta');

insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time) values
  ('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 2, '10:00', '14:00');

create table pg_temp.tokens (
  kind text primary key,
  invitation_id uuid,
  token text
);
grant all on pg_temp.tokens to authenticated;
grant select on pg_temp.tokens to anon;

-- ---------------------------------------------------------------------------
-- Anonymous restrictions
-- ---------------------------------------------------------------------------
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  $$select public.set_staff_weekly_hours('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', null, 'anon cannot call set_staff_weekly_hours'
);
select throws_ok(
  $$select count(*) from public.business_invitations$$,
  '42501', null, 'anon has no table access to business_invitations'
);
select throws_ok(
  $$select * from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'staff'::public.member_role, null)$$,
  '42501', null, 'anon cannot create invitations'
);
select throws_ok(
  $$select * from public.accept_business_invitation('fake-token', null)$$,
  '42501', null, 'anon cannot accept invitations'
);

reset role;

-- ---------------------------------------------------------------------------
-- Staff and outsider restrictions
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$select public.set_staff_weekly_hours('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', null, 'staff role cannot replace weekly hours'
);
select throws_ok(
  $$select * from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'staff'::public.member_role, null)$$,
  '42501', null, 'staff role cannot create invitations'
);
select is(
  (select count(*)::int from public.business_invitations),
  0,
  'staff role sees no business_invitations'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000006","role":"authenticated"}';

select throws_ok(
  $$select public.set_staff_weekly_hours('b0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', null, 'another business owner cannot edit weekly hours'
);

reset role;

-- ---------------------------------------------------------------------------
-- Manager: schedule replacement + cannot create invitations
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select * from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'staff'::public.member_role, null)$$,
  '42501', null, 'manager cannot create invitations (owner only)'
);
select throws_ok(
  $$select public.set_staff_weekly_hours(
      'b0000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      '[{"weekday":1,"start_time":"09:00","end_time":"13:00"},{"weekday":1,"start_time":"12:00","end_time":"16:00"}]'::jsonb
    )$$,
  '23514', 'overlapping_weekly_hours', 'overlapping weekly hours on the same weekday are rejected'
);

select public.set_staff_weekly_hours(
  'b0000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '[{"weekday":1,"start_time":"09:00","end_time":"18:00"},{"weekday":5,"start_time":"09:00","end_time":"12:00"},{"weekday":5,"start_time":"13:00","end_time":"17:00"}]'::jsonb
);

reset role;

select is(
  (select count(*)::int from public.weekly_hours where staff_id = '51000000-0000-0000-0000-000000000001'),
  3,
  'manager replaces weekly hours atomically including a split shift on Friday'
);

-- Owner can clear weekly hours
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select public.set_staff_weekly_hours(
  'b0000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '[]'::jsonb
);

reset role;

select is(
  (select count(*)::int from public.weekly_hours where staff_id = '51000000-0000-0000-0000-000000000001'),
  0,
  'owner can clear weekly hours with an empty JSON array'
);

-- ---------------------------------------------------------------------------
-- Owner creates invitations and invitees accept them
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select * from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'owner'::public.member_role, null)$$,
  '23514', 'invalid_invite_role', 'owner cannot create an owner-level invitation'
);
select throws_ok(
  $$select * from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'staff'::public.member_role, '51000000-0000-0000-0000-000000000001')$$,
  '23514', 'staff_already_linked', 'cannot invite for a staff member already linked to a user'
);

insert into pg_temp.tokens (kind, invitation_id, token)
select 'staff-linked', invitation_id, token
from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'staff'::public.member_role, '51000000-0000-0000-0000-000000000002');

insert into pg_temp.tokens (kind, invitation_id, token)
select 'manager', invitation_id, token
from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'manager'::public.member_role, null);

insert into pg_temp.tokens (kind, invitation_id, token)
select 'staff-open', invitation_id, token
from public.create_business_invitation('b0000000-0000-0000-0000-000000000001', 'staff'::public.member_role, null);

select ok(
  (select token ~ '^[0-9a-f]{64}$' from pg_temp.tokens where kind = 'staff-linked'),
  'create_business_invitation returns a 64-hex raw token'
);

reset role;

select is(
  (select i.token_hash from public.business_invitations i join pg_temp.tokens t on t.invitation_id = i.id where t.kind = 'staff-linked'),
  (select encode(sha256(convert_to(t.token, 'UTF8')), 'hex') from pg_temp.tokens t where t.kind = 'staff-linked'),
  'only the SHA-256 hash of the invitation token is stored'
);

-- Anon preview
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select is(
  (select row(g.business_name, g.role::text, g.staff_name, g.is_valid)::text
   from pg_temp.tokens t
   cross join lateral public.get_business_invitation(t.token) g
   where t.kind = 'staff-linked'),
  row('North Barbers', 'staff', 'Marta', true)::text,
  'anon can preview a valid invitation without table access'
);

reset role;

-- Staff invitee accepts linked invitation
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select row(a.business_id, a.role::text)::text
   from pg_temp.tokens t
   cross join lateral public.accept_business_invitation(t.token, null) a
   where t.kind = 'staff-linked'),
  row('b0000000-0000-0000-0000-000000000001'::uuid, 'staff')::text,
  'accept_business_invitation returns the joined business_id and role'
);

reset role;

select is(
  (select role::text from public.business_members
   where business_id = 'b0000000-0000-0000-0000-000000000001'
     and user_id = 'a0000000-0000-0000-0000-000000000004'),
  'staff',
  'invitee becomes a business member with the invited role'
);
select is(
  (select member_user_id from public.staff where id = '51000000-0000-0000-0000-000000000002'),
  'a0000000-0000-0000-0000-000000000004'::uuid,
  'linked staff row gets member_user_id assigned on acceptance'
);
select ok(
  (select i.accepted_at is not null and i.accepted_by = 'a0000000-0000-0000-0000-000000000004'::uuid
   from public.business_invitations i join pg_temp.tokens t on t.invitation_id = i.id where t.kind = 'staff-linked'),
  'invitation is marked accepted by the invitee'
);

-- Reuse rejected + preview becomes invalid
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';

select throws_ok(
  $$select * from public.accept_business_invitation((select token from pg_temp.tokens where kind = 'staff-linked'), null)$$,
  'P0001', 'invitation_invalid_or_expired', 'an accepted invitation token cannot be used twice'
);

reset role;

set local role anon;
select is(
  (select g.is_valid
   from pg_temp.tokens t
   cross join lateral public.get_business_invitation(t.token) g
   where t.kind = 'staff-linked'),
  false,
  'preview shows is_valid = false after invitation is accepted'
);
reset role;

-- Manager invitee accepts manager invitation
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is(
  (select a.role::text
   from pg_temp.tokens t
   cross join lateral public.accept_business_invitation(t.token, null) a
   where t.kind = 'manager'),
  'manager',
  'manager invitee accepts manager invitation'
);

reset role;

-- Already-member cannot accept another invitation to the same business
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

select throws_ok(
  $$select * from public.accept_business_invitation((select token from pg_temp.tokens where kind = 'staff-open'), 'Duplicate')$$,
  'P0001', 'already_business_member', 'existing business member cannot accept another invitation for the same business'
);

reset role;

-- Open staff invite creates a new staff row when display_name is passed
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated"}';

select public.accept_business_invitation((select token from pg_temp.tokens where kind = 'staff-open'), '  Olena ');

reset role;

select is(
  (select display_name from public.staff
   where business_id = 'b0000000-0000-0000-0000-000000000001'
     and member_user_id = 'a0000000-0000-0000-0000-000000000007'),
  'Olena',
  'accepting an open staff invitation with display_name creates a linked staff profile'
);

select * from finish();

rollback;
