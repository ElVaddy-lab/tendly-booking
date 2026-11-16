begin;

select plan(23);

-- 1. Seeded demo business & users exist via seed/reset function
select is(
  (select count(*)::int from public.businesses where id = 'd0000000-0000-4000-8000-000000000001' and slug = 'northside-barbers' and is_demo),
  1,
  'seeded demo business northside-barbers exists with is_demo = true'
);

select is(
  (select count(*)::int from public.staff where business_id = 'd0000000-0000-4000-8000-000000000001' and is_active),
  3,
  'demo business starts on Free cap with 3 active barbers'
);

select is(
  (select count(*)::int from public.services where business_id = 'd0000000-0000-4000-8000-000000000001' and is_active),
  5,
  'demo business starts on Free cap with 5 active services'
);

select is(
  (select count(*)::int from public.staff where business_id = 'd0000000-0000-4000-8000-000000000001' and telegram_chat_id is not null),
  0,
  'demo staff start with Telegram unlinked'
);

select ok(
  exists (
    select 1 from cron.job where jobname = 'tendly-nightly-demo-reset'
  ),
  'nightly demo reset pg_cron job is scheduled'
);

-- 2. Verify privilege restrictions on reset_demo_and_expired_data()
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';
select throws_ok(
  $$select public.reset_demo_and_expired_data()$$,
  '42501', null, 'anon cannot invoke reset_demo_and_expired_data'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"role":"authenticated","sub":"d0000000-0000-4000-8000-000000000011"}';
select throws_ok(
  $$select public.reset_demo_and_expired_data()$$,
  '42501', null, 'demo owner cannot invoke reset_demo_and_expired_data'
);

-- 3. Demo owner hits Free limits (4th staff / 6th service blocked)
select throws_ok(
  $$insert into public.staff (business_id, display_name) values ('d0000000-0000-4000-8000-000000000001', 'Extra Barber')$$,
  'P0001', 'plan_limit_staff', 'demo shop enforces 3 active staff limit on Free plan'
);
select throws_ok(
  $$insert into public.services (business_id, name, duration_min, buffer_min, price_cents) values ('d0000000-0000-4000-8000-000000000001', 'Extra Service', 30, 0, 2500)$$,
  'P0001', 'plan_limit_services', 'demo shop enforces 5 active services limit on Free plan'
);

-- 4. Demo immutability guards (cannot change demo slug/is_demo, demote/remove fixed demo members, or link Telegram)
select throws_ok(
  $$update public.businesses set slug = 'hijacked-slug' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501', 'demo_business_immutable', 'demo owner cannot rename demo business slug'
);
select throws_ok(
  $$update public.businesses set is_demo = false where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501', 'demo_business_immutable', 'demo owner cannot clear is_demo flag'
);
select throws_ok(
  $$delete from public.business_members where business_id = 'd0000000-0000-4000-8000-000000000001' and user_id = 'd0000000-0000-4000-8000-000000000012'$$,
  '42501', 'demo_member_immutable', 'demo owner cannot remove seeded demo manager'
);
select throws_ok(
  $$update public.business_members set role = 'staff' where business_id = 'd0000000-0000-4000-8000-000000000001' and user_id = 'd0000000-0000-4000-8000-000000000012'$$,
  '42501', 'demo_member_immutable', 'demo owner cannot demote seeded demo manager'
);
select throws_ok(
  $$select public.create_telegram_link_code('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000021')$$,
  '42501', 'demo_telegram_disabled', 'demo staff cannot create Telegram link code'
);
reset role;

-- 5. Superuser / Auth triggers: demo business deletion & demo auth email/password changes blocked, last_sign_in_at allowed
select throws_ok(
  $$delete from public.businesses where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501', 'demo_business_immutable', 'demo business cannot be deleted directly'
);
select throws_ok(
  $$update auth.users set email = 'evil@example.test' where id = 'd0000000-0000-4000-8000-000000000011'$$,
  '42501', 'demo_credentials_immutable', 'demo auth email cannot be changed'
);
select throws_ok(
  $$update auth.users set encrypted_password = 'tampered' where id = 'd0000000-0000-4000-8000-000000000011'$$,
  '42501', 'demo_credentials_immutable', 'demo auth password cannot be changed'
);
select throws_ok(
  $$delete from auth.users where id = 'd0000000-0000-4000-8000-000000000011'$$,
  '42501', 'demo_user_immutable', 'demo auth user cannot be deleted'
);
select lives_ok(
  $$update auth.users set last_sign_in_at = now(), updated_at = now() where id = 'd0000000-0000-4000-8000-000000000011'$$,
  'normal GoTrue login timestamp update succeeds on demo user'
);

-- 6. Nightly reset clears >24h visitor businesses & users, preserves <24h visitor businesses, and restores demo Free plan
insert into auth.users (id, aud, role, email, created_at) values
  ('c0000000-0000-4000-8000-000000000091', 'authenticated', 'authenticated', 'expired-visitor@example.test', now() - interval '25 hours'),
  ('c0000000-0000-4000-8000-000000000092', 'authenticated', 'authenticated', 'fresh-visitor@example.test', now() - interval '2 hours');

insert into public.businesses (id, slug, name, timezone, is_demo, created_by, created_at) values
  ('b0000000-0000-4000-8000-000000000091', 'expired-visitor-shop', 'Expired Shop', 'Europe/Kyiv', false, 'c0000000-0000-4000-8000-000000000091', now() - interval '25 hours'),
  ('b0000000-0000-4000-8000-000000000092', 'fresh-visitor-shop', 'Fresh Shop', 'Europe/Kyiv', false, 'c0000000-0000-4000-8000-000000000092', now() - interval '2 hours');

insert into public.business_members (business_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000091', 'c0000000-0000-4000-8000-000000000091', 'owner'),
  ('b0000000-0000-4000-8000-000000000092', 'c0000000-0000-4000-8000-000000000092', 'owner');

-- Upgrade demo temporarily to Pro and add 4th staff
insert into public.business_subscriptions (business_id, stripe_customer_id, stripe_subscription_id, plan_tier, status)
values ('d0000000-0000-4000-8000-000000000001', 'cus_demo_temp', 'sub_demo_temp', 'pro', 'active')
on conflict (business_id) do update set plan_tier = 'pro', status = 'active', stripe_customer_id = 'cus_demo_temp', stripe_subscription_id = 'sub_demo_temp';

insert into public.staff (business_id, display_name) values ('d0000000-0000-4000-8000-000000000001', 'Temporary Pro Barber');

select lives_ok(
  $$select public.reset_demo_and_expired_data()$$,
  'reset_demo_and_expired_data runs cleanly'
);

select is(
  (select count(*)::int from public.businesses where id in ('b0000000-0000-4000-8000-000000000091', 'b0000000-0000-4000-8000-000000000092')),
  1,
  'reset deletes >24h visitor business and preserves <24h visitor business'
);

select is(
  (select count(*)::int from public.businesses b join public.business_subscriptions s on s.business_id = b.id where b.id = 'd0000000-0000-4000-8000-000000000001' and s.plan_tier = 'free'),
  1,
  'reset restores demo shop subscription back to Free plan'
);

select is(
  (select count(*)::int from public.staff where business_id = 'd0000000-0000-4000-8000-000000000001'),
  3,
  'reset removes temporary Pro barber and restores exact 3 demo barbers'
);

select finish();
rollback;
