begin;

select plan(29);

-- ---------------------------------------------------------------------------
-- Fixtures (as the test superuser)
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'founder@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rival@example.test');

create table pg_temp.state (
  business_id uuid,
  staff_id uuid,
  service_id uuid
);
grant all on pg_temp.state to authenticated;
grant select on pg_temp.state to anon;

-- ---------------------------------------------------------------------------
-- Function existence and privileges
-- ---------------------------------------------------------------------------
select has_function(
  'public', 'create_business', array['text', 'text', 'text'],
  'public.create_business(text, text, text) exists'
);
select has_function(
  'public', 'complete_onboarding',
  array['uuid', 'text', 'text', 'integer', 'integer', 'integer', 'smallint[]', 'time without time zone', 'time without time zone'],
  'public.complete_onboarding exists'
);

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  $$select public.create_business('Anon Shop', 'anon-shop', 'Europe/Kyiv')$$,
  '42501', null, 'anon cannot execute create_business'
);
select throws_ok(
  $$insert into public.businesses (slug, name, timezone) values ('anon-shop', 'Anon Shop', 'Europe/Kyiv')$$,
  '42501', null, 'anon cannot insert into businesses directly'
);
select throws_ok(
  $$select * from public.complete_onboarding('b0000000-0000-0000-0000-000000000001', 'Anon', 'Cut', 30)$$,
  '42501', null, 'anon cannot execute complete_onboarding'
);

reset role;

-- ---------------------------------------------------------------------------
-- Direct table insert & missing auth.uid() guard
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"role":"authenticated"}';

select throws_ok(
  $$insert into public.businesses (slug, name, timezone) values ('direct-shop', 'Direct Shop', 'Europe/Kyiv')$$,
  '42501', null, 'authenticated cannot insert into businesses directly'
);
select throws_ok(
  $$select public.create_business('No Sub Shop', 'no-sub-shop', 'Europe/Kyiv')$$,
  '42501', 'not_authenticated', 'create_business rejects authenticated session without sub claim'
);

reset role;

-- ---------------------------------------------------------------------------
-- create_business happy path and second-business guard
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into pg_temp.state (business_id)
values (public.create_business('  Northside Studio ', 'Northside-Studio', 'Europe/Kyiv'));

select ok(
  (select business_id is not null from pg_temp.state),
  'create_business returns a non-null business_id'
);

reset role;

select is(
  (select row(b.name, b.slug, b.timezone, b.created_by, b.is_demo)::text
   from public.businesses b join pg_temp.state s on s.business_id = b.id),
  row('Northside Studio', 'northside-studio', 'Europe/Kyiv', 'a0000000-0000-0000-0000-000000000001'::uuid, false)::text,
  'create_business trims name, lowercases slug, sets timezone, created_by and is_demo = false'
);
select is(
  (select m.role::text
   from public.business_members m join pg_temp.state s on s.business_id = m.business_id
   where m.user_id = 'a0000000-0000-0000-0000-000000000001'),
  'owner',
  'create_business adds the caller as owner in business_members'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.create_business('Second Studio', 'second-studio', 'Europe/Kyiv')$$,
  'P0001', 'already_owns_business', 'a user cannot create a second business'
);

reset role;

-- ---------------------------------------------------------------------------
-- create_business validation and slug uniqueness (as a second user)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.create_business('Rival Studio', 'northside-studio', 'Europe/Kyiv')$$,
  '23505', 'slug_taken', 'duplicate slug raises 23505 / slug_taken'
);
select throws_ok(
  $$select public.create_business('Dash', 'dashboard', 'Europe/Kyiv')$$,
  '23514', 'slug_reserved', 'reserved slug dashboard is rejected'
);
select throws_ok(
  $$select public.create_business('SignIn', 'sign-in', 'Europe/Kyiv')$$,
  '23514', 'slug_reserved', 'reserved slug sign-in is rejected'
);
select throws_ok(
  $$select public.create_business('Api', 'api', 'Europe/Kyiv')$$,
  '23514', 'slug_reserved', 'reserved slug api is rejected'
);
select throws_ok(
  $$select public.create_business('Too Short', 'a', 'Europe/Kyiv')$$,
  '23514', null, 'too-short slug is rejected'
);
select throws_ok(
  $$select public.create_business('Bad Chars', 'bad_slug!', 'Europe/Kyiv')$$,
  '23514', null, 'slug with invalid characters is rejected'
);
select throws_ok(
  $$select public.create_business('Bad Hyphens', '-bad-', 'Europe/Kyiv')$$,
  '23514', null, 'slug with leading/trailing hyphens is rejected'
);
select throws_ok(
  $$select public.create_business('Bad Zone', 'valid-slug-zone', 'Mars/Olympus')$$,
  '23514', null, 'invalid timezone is rejected'
);
select throws_ok(
  $$select public.create_business('   ', 'valid-slug-name', 'Europe/Kyiv')$$,
  '23514', null, 'blank business name is rejected'
);

-- Outsider cannot call complete_onboarding on founder's business (RLS blocks insert into staff)
select throws_ok(
  $$select * from public.complete_onboarding(
      (select business_id from pg_temp.state),
      'Intruder', 'Hack', 30, 0, 1000, array[1,2]::smallint[], '09:00', '18:00'
    )$$,
  '42501', null, 'non-member cannot complete onboarding for another business'
);

reset role;

-- ---------------------------------------------------------------------------
-- complete_onboarding validation and happy path (as founder)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select * from public.complete_onboarding(
      (select business_id from pg_temp.state),
      'Andriy', 'Haircut', 30, 10, 3500, '{}'::smallint[], '09:00', '18:00'
    )$$,
  '23514', 'weekdays_required', 'empty weekdays array is rejected'
);
select throws_ok(
  $$select * from public.complete_onboarding(
      (select business_id from pg_temp.state),
      'Andriy', 'Haircut', 30, 10, 3500, array[1,2]::smallint[], '18:00', '09:00'
    )$$,
  '23514', null, 'inverted working hours are rejected'
);

with completed as (
  select * from public.complete_onboarding(
    (select business_id from pg_temp.state),
    '  Andriy ', '  Haircut ', 30, 10, 3500,
    array[1, 2, 3, 4, 5]::smallint[], '09:00', '18:00'
  )
)
update pg_temp.state s
set staff_id = c.staff_id,
    service_id = c.service_id
from completed c;

select ok(
  (select staff_id is not null and service_id is not null from pg_temp.state),
  'complete_onboarding returns staff_id and service_id'
);

reset role;

select is(
  (select row(st.display_name, st.member_user_id, st.is_active)::text
   from public.staff st join pg_temp.state s on s.staff_id = st.id and s.business_id = st.business_id),
  row('Andriy', 'a0000000-0000-0000-0000-000000000001'::uuid, true)::text,
  'complete_onboarding creates staff linked to the owner with trimmed display_name'
);
select is(
  (select row(sv.name, sv.duration_min, sv.buffer_min, sv.price_cents, sv.is_active)::text
   from public.services sv join pg_temp.state s on s.service_id = sv.id and s.business_id = sv.business_id),
  row('Haircut', 30, 10, 3500, true)::text,
  'complete_onboarding creates the first service with trimmed name, duration, buffer and price'
);
select is(
  (select count(*)::int
   from public.staff_services ss join pg_temp.state s
     on s.business_id = ss.business_id and s.staff_id = ss.staff_id and s.service_id = ss.service_id),
  1,
  'complete_onboarding links staff and service in staff_services'
);
select is(
  (select count(*)::int
   from public.weekly_hours wh join pg_temp.state s
     on s.business_id = wh.business_id and s.staff_id = wh.staff_id
   where wh.weekday in (1, 2, 3, 4, 5)
     and wh.start_time = '09:00'::time
     and wh.end_time = '18:00'::time),
  5,
  'complete_onboarding creates 5 weekly_hours rows for Mon-Fri 09:00-18:00'
);

-- Public available_slots sees bookable slots immediately after onboarding
set local role anon;
select ok(
  (select count(*)::int
   from public.available_slots(
     (select business_id from pg_temp.state),
     (select service_id from pg_temp.state),
     (select staff_id from pg_temp.state),
     now(),
     now() + interval '7 days'
   )) > 0,
  'anon sees available slots immediately after onboarding completes'
);
reset role;

select * from finish();

rollback;
