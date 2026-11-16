-- Stage 13: Fictional seeded demo shop ("Northside Barbers"), DB/Auth immutability guards
-- for demo accounts, and nightly cleanup/reset of demo data and expired visitor data (> 24h).

create function private.demo_business_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select 'd0000000-0000-4000-8000-000000000001'::uuid;
$$;

create function private.is_demo_user(p_user_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_user_id = any (array[
    'd0000000-0000-4000-8000-000000000011'::uuid,
    'd0000000-0000-4000-8000-000000000012'::uuid,
    'd0000000-0000-4000-8000-000000000013'::uuid
  ]);
$$;

revoke execute on function private.demo_business_id() from public, anon, authenticated;
revoke execute on function private.is_demo_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Demo immutability guards (DB + Auth layer, not just UI)
-- ---------------------------------------------------------------------------
create function private.guard_demo_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.allow_demo_reset', true) = 'on' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if TG_OP = 'DELETE' and OLD.is_demo then
    raise exception using errcode = '42501', message = 'demo_business_immutable';
  end if;

  if TG_OP = 'UPDATE' and OLD.is_demo then
    if NEW.id is distinct from OLD.id
       or NEW.slug is distinct from OLD.slug
       or NEW.is_demo is distinct from OLD.is_demo
       or NEW.created_by is distinct from OLD.created_by then
      raise exception using errcode = '42501', message = 'demo_business_immutable';
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function private.guard_demo_business() from public, anon, authenticated;

create trigger businesses_guard_demo_trg
  before update or delete on public.businesses
  for each row
  execute function private.guard_demo_business();

create function private.guard_demo_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.allow_demo_reset', true) = 'on' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if OLD.business_id = private.demo_business_id() and private.is_demo_user(OLD.user_id) then
    raise exception using errcode = '42501', message = 'demo_member_immutable';
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

revoke all on function private.guard_demo_members() from public, anon, authenticated;

create trigger business_members_guard_demo_trg
  before update or delete on public.business_members
  for each row
  execute function private.guard_demo_members();

create function private.guard_demo_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_demo boolean := false;
begin
  if current_setting('app.allow_demo_reset', true) = 'on' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  select b.is_demo
    into v_is_demo
  from public.businesses b
  where b.id = case when TG_OP = 'DELETE' then OLD.business_id else NEW.business_id end;

  if coalesce(v_is_demo, false) then
    if TG_OP = 'DELETE' and OLD.id = any (array[
      'd0000000-0000-4000-8000-000000000021'::uuid,
      'd0000000-0000-4000-8000-000000000022'::uuid,
      'd0000000-0000-4000-8000-000000000023'::uuid
    ]) then
      raise exception using errcode = '42501', message = 'demo_staff_immutable';
    end if;

    if TG_OP in ('INSERT', 'UPDATE') and (
      NEW.telegram_chat_id is not null
      or NEW.telegram_link_code_hash is not null
    ) then
      raise exception using errcode = '42501', message = 'demo_telegram_disabled';
    end if;
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

revoke all on function private.guard_demo_staff() from public, anon, authenticated;

create trigger staff_guard_demo_trg
  before insert or update or delete on public.staff
  for each row
  execute function private.guard_demo_staff();

create or replace function public.create_telegram_link_code(
  p_business_id uuid,
  p_staff_id uuid
)
returns table (
  link_code text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_demo boolean := false;
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_business_id not in (select private.business_ids_with_role('manager'))
     and p_staff_id not in (select private.own_staff_ids()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select b.is_demo
    into v_is_demo
  from public.businesses b
  where b.id = p_business_id;

  if coalesce(v_is_demo, false) then
    raise exception using errcode = '42501', message = 'demo_telegram_disabled';
  end if;

  v_code := encode(extensions.gen_random_bytes(16), 'hex');

  update public.staff st
  set telegram_link_code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
      telegram_link_expires_at = v_expires
  where st.id = p_staff_id
    and st.business_id = p_business_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;

  return query select v_code, v_expires;
end;
$$;

revoke execute on function public.create_telegram_link_code(uuid, uuid) from public, anon;
grant execute on function public.create_telegram_link_code(uuid, uuid) to authenticated, service_role;

-- Block email/password edits and deletions on fixed demo accounts in auth.users while allowing login updates.
create function private.guard_demo_auth_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.allow_demo_reset', true) = 'on' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if not private.is_demo_user(OLD.id) then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501', message = 'demo_user_immutable';
  end if;

  if NEW.email is distinct from OLD.email
     or NEW.encrypted_password is distinct from OLD.encrypted_password
     or NEW.email_change is distinct from OLD.email_change
     or NEW.email_change_token_new is distinct from OLD.email_change_token_new
     or NEW.email_change_token_current is distinct from OLD.email_change_token_current
     or NEW.phone is distinct from OLD.phone
     or NEW.phone_change is distinct from OLD.phone_change
     or NEW.deleted_at is distinct from OLD.deleted_at then
    raise exception using errcode = '42501', message = 'demo_credentials_immutable';
  end if;

  return NEW;
end;
$$;

revoke all on function private.guard_demo_auth_users() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'auth_users_guard_demo_trg'
      and tgrelid = 'auth.users'::regclass
  ) then
    execute 'create trigger auth_users_guard_demo_trg before update or delete on auth.users for each row execute function private.guard_demo_auth_users()';
  end if;
exception
  when insufficient_privilege then
    raise notice 'Skipping auth.users trigger creation due to managed role privileges.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Idempotent seed & nightly reset RPC
-- ---------------------------------------------------------------------------
create function public.reset_demo_and_expired_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_demo_biz uuid := private.demo_business_id();
  v_owner_id uuid := 'd0000000-0000-4000-8000-000000000011'::uuid;
  v_manager_id uuid := 'd0000000-0000-4000-8000-000000000012'::uuid;
  v_staff_id uuid := 'd0000000-0000-4000-8000-000000000013'::uuid;
  v_andriy_id uuid := 'd0000000-0000-4000-8000-000000000021'::uuid;
  v_marta_id uuid := 'd0000000-0000-4000-8000-000000000022'::uuid;
  v_sam_id uuid := 'd0000000-0000-4000-8000-000000000023'::uuid;
  v_svc_haircut uuid := 'd0000000-0000-4000-8000-000000000031'::uuid;
  v_svc_beard uuid := 'd0000000-0000-4000-8000-000000000032'::uuid;
  v_svc_combo uuid := 'd0000000-0000-4000-8000-000000000033'::uuid;
  v_svc_fade uuid := 'd0000000-0000-4000-8000-000000000034'::uuid;
  v_svc_shave uuid := 'd0000000-0000-4000-8000-000000000035'::uuid;
  v_base_day date := (now() at time zone 'Europe/Kyiv')::date + 1;
  v_expired_biz_count integer := 0;
  v_expired_user_count integer := 0;
  v_user_rec record;
begin
  perform set_config('app.allow_demo_reset', 'on', true);

  -- 1. Remove visitor-created non-demo businesses older than 24 hours.
  with deleted_biz as (
    delete from public.businesses
    where is_demo = false
      and created_at < now() - interval '24 hours'
    returning id
  )
  select count(*)::int into v_expired_biz_count from deleted_biz;

  -- Remove orphaned non-demo users older than 24 hours with no active membership.
  with deleted_users as (
    delete from auth.users u
    where not private.is_demo_user(u.id)
      and u.created_at < now() - interval '24 hours'
      and not exists (
        select 1
        from public.business_members m
        where m.user_id = u.id
      )
    returning u.id
  )
  select count(*)::int into v_expired_user_count from deleted_users;

  -- 2. Upsert the three fixed demo Auth accounts + email identities.
  for v_user_rec in
    select *
    from (
      values
        (v_owner_id, 'owner@demo.tendly.example', 'owner'),
        (v_manager_id, 'manager@demo.tendly.example', 'manager'),
        (v_staff_id, 'staff@demo.tendly.example', 'staff')
    ) as t(uid, email, role_name)
  loop
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user,
      is_anonymous,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_rec.uid,
      'authenticated',
      'authenticated',
      v_user_rec.email,
      extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_demo', true, 'demo_role', v_user_rec.role_name),
      jsonb_build_object('is_demo', true, 'demo_role', v_user_rec.role_name),
      false,
      false,
      now(),
      now()
    )
    on conflict (id) do update
      set email = excluded.email,
          email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
          raw_app_meta_data = excluded.raw_app_meta_data,
          raw_user_meta_data = excluded.raw_user_meta_data,
          deleted_at = null,
          updated_at = now();

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      created_at,
      updated_at
    ) values (
      v_user_rec.uid::text,
      v_user_rec.uid,
      jsonb_build_object(
        'sub', v_user_rec.uid::text,
        'email', v_user_rec.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now()
    )
    on conflict (provider_id, provider) do update
      set identity_data = excluded.identity_data,
          updated_at = now();
  end loop;

  -- 3. Upsert fictional Northside Barbers demo shop (Free tier at 3 staff / 5 services).
  insert into public.businesses (
    id,
    slug,
    name,
    timezone,
    min_notice_minutes,
    booking_horizon_days,
    slot_step_minutes,
    cancellation_deadline_hours,
    is_demo,
    created_by
  ) values (
    v_demo_biz,
    'northside-barbers',
    'Northside Barbers',
    'Europe/Kyiv',
    60,
    60,
    15,
    24,
    true,
    v_owner_id
  )
  on conflict (id) do update
    set slug = excluded.slug,
        name = excluded.name,
        timezone = excluded.timezone,
        min_notice_minutes = excluded.min_notice_minutes,
        booking_horizon_days = excluded.booking_horizon_days,
        slot_step_minutes = excluded.slot_step_minutes,
        cancellation_deadline_hours = excluded.cancellation_deadline_hours,
        is_demo = true,
        created_by = v_owner_id;

  -- Clear mutable demo children cleanly before re-seeding
  delete from public.notification_outbox where business_id = v_demo_biz;
  delete from public.bookings where business_id = v_demo_biz;
  delete from public.time_off where business_id = v_demo_biz;
  delete from public.weekly_hours where business_id = v_demo_biz;
  delete from public.staff_services where business_id = v_demo_biz;
  delete from public.business_invitations where business_id = v_demo_biz;
  delete from public.stripe_events where business_id = v_demo_biz;

  -- Reset demo subscription to Free BEFORE pruning temporary Pro staff/services cleanly
  insert into public.business_subscriptions (
    business_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end
  ) values (
    v_demo_biz,
    null,
    null,
    null,
    'free'::public.plan_tier,
    'active'::public.subscription_status,
    null,
    null,
    false
  )
  on conflict (business_id) do update
    set stripe_customer_id = null,
        stripe_subscription_id = null,
        stripe_price_id = null,
        plan_tier = 'free'::public.plan_tier,
        status = 'active'::public.subscription_status,
        current_period_start = null,
        current_period_end = null,
        cancel_at_period_end = false;

  delete from public.staff
  where business_id = v_demo_biz
    and id not in (v_andriy_id, v_marta_id, v_sam_id);

  delete from public.services
  where business_id = v_demo_biz
    and id not in (v_svc_haircut, v_svc_beard, v_svc_combo, v_svc_fade, v_svc_shave);

  delete from public.business_members
  where business_id = v_demo_biz
    and user_id not in (v_owner_id, v_manager_id, v_staff_id);

  insert into public.business_members (business_id, user_id, role) values
    (v_demo_biz, v_owner_id, 'owner'),
    (v_demo_biz, v_manager_id, 'manager'),
    (v_demo_biz, v_staff_id, 'staff')
  on conflict (business_id, user_id) do update
    set role = excluded.role;

  insert into public.staff (
    id, business_id, member_user_id, display_name, is_active,
    telegram_chat_id, telegram_link_code_hash, telegram_link_expires_at, telegram_linked_at,
    ics_token_hash, ics_enabled_at
  ) values
    (v_andriy_id, v_demo_biz, v_owner_id, 'Andriy', true, null, null, null, null, null, null),
    (v_marta_id, v_demo_biz, v_manager_id, 'Marta', true, null, null, null, null, null, null),
    (v_sam_id, v_demo_biz, v_staff_id, 'Sam', true, null, null, null, null, null, null)
  on conflict (id) do update
    set business_id = excluded.business_id,
        member_user_id = excluded.member_user_id,
        display_name = excluded.display_name,
        is_active = true,
        telegram_chat_id = null,
        telegram_link_code_hash = null,
        telegram_link_expires_at = null,
        telegram_linked_at = null,
        ics_token_hash = null,
        ics_enabled_at = null;

  insert into public.services (
    id, business_id, name, description, duration_min, buffer_min, price_cents, currency, is_active
  ) values
    (v_svc_haircut, v_demo_biz, 'Haircut', 'Classic scissor and clipper cut with styling.', 30, 0, 3500, 'USD', true),
    (v_svc_beard, v_demo_biz, 'Beard trim', 'Crisp beard shaping and line-up.', 20, 0, 2000, 'USD', true),
    (v_svc_combo, v_demo_biz, 'Cut & beard', 'Full haircut and detailed beard trim.', 50, 10, 5000, 'USD', true),
    (v_svc_fade, v_demo_biz, 'Fade & line-up', 'Skin or taper fade with razor edge.', 40, 5, 4000, 'USD', true),
    (v_svc_shave, v_demo_biz, 'Hot towel shave', 'Traditional straight-razor shave with warm towel.', 30, 5, 3000, 'USD', true)
  on conflict (id) do update
    set business_id = excluded.business_id,
        name = excluded.name,
        description = excluded.description,
        duration_min = excluded.duration_min,
        buffer_min = excluded.buffer_min,
        price_cents = excluded.price_cents,
        currency = excluded.currency,
        is_active = true;

  insert into public.staff_services (business_id, staff_id, service_id) values
    (v_demo_biz, v_andriy_id, v_svc_haircut),
    (v_demo_biz, v_andriy_id, v_svc_beard),
    (v_demo_biz, v_andriy_id, v_svc_combo),
    (v_demo_biz, v_andriy_id, v_svc_fade),
    (v_demo_biz, v_andriy_id, v_svc_shave),
    (v_demo_biz, v_marta_id, v_svc_haircut),
    (v_demo_biz, v_marta_id, v_svc_beard),
    (v_demo_biz, v_marta_id, v_svc_combo),
    (v_demo_biz, v_marta_id, v_svc_fade),
    (v_demo_biz, v_sam_id, v_svc_haircut),
    (v_demo_biz, v_sam_id, v_svc_beard),
    (v_demo_biz, v_sam_id, v_svc_shave);

  -- Mon–Sun hours in Europe/Kyiv so every visitor day has open demo slots
  insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
  select v_demo_biz, v_andriy_id, d, '09:00'::time, '18:00'::time from generate_series(1, 7) as d
  union all
  select v_demo_biz, v_marta_id, d, '09:00'::time, '17:00'::time from generate_series(1, 6) as d
  union all
  select v_demo_biz, v_sam_id, d, '10:00'::time, '18:00'::time from generate_series(1, 7) as d;

  -- One lunch/errand break for Marta on day + 2 in Europe/Kyiv
  insert into public.time_off (business_id, staff_id, period, reason) values (
    v_demo_biz,
    v_marta_id,
    tstzrange(
      ((v_base_day + 1)::text || ' 12:00:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day + 1)::text || ' 13:30:00')::timestamp at time zone 'Europe/Kyiv',
      '[)'
    ),
    'Supply restock (demo)'
  );

  -- Seed realistic fictional sample bookings in Europe/Kyiv
  insert into public.bookings (
    id, business_id, staff_id, service_id,
    starts_at, ends_at, blocked_until, status,
    customer_name, customer_email, customer_timezone, notes, manage_token_hash
  ) values
    (
      'd0000000-0000-4000-8000-000000000101'::uuid,
      v_demo_biz, v_andriy_id, v_svc_haircut,
      ((v_base_day)::text || ' 10:00:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day)::text || ' 10:30:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day)::text || ' 10:30:00')::timestamp at time zone 'Europe/Kyiv',
      'confirmed',
      'Alex Rivera', 'alex.rivera@northside-demo.example', 'Europe/Kyiv',
      'Demo booking — mid taper on the sides',
      encode(sha256(convert_to('demo-booking-token-101', 'UTF8')), 'hex')
    ),
    (
      'd0000000-0000-4000-8000-000000000102'::uuid,
      v_demo_biz, v_marta_id, v_svc_combo,
      ((v_base_day)::text || ' 11:00:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day)::text || ' 11:50:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day)::text || ' 12:00:00')::timestamp at time zone 'Europe/Kyiv',
      'confirmed',
      'Nazar Koval', 'nazar.koval@northside-demo.example', 'Europe/Kyiv',
      'Demo booking — keep beard length on chin',
      encode(sha256(convert_to('demo-booking-token-102', 'UTF8')), 'hex')
    ),
    (
      'd0000000-0000-4000-8000-000000000103'::uuid,
      v_demo_biz, v_sam_id, v_svc_shave,
      ((v_base_day)::text || ' 14:00:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day)::text || ' 14:30:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day)::text || ' 14:35:00')::timestamp at time zone 'Europe/Kyiv',
      'confirmed',
      'Daniel Brooks', 'daniel.brooks@northside-demo.example', 'America/New_York',
      'Demo booking — visiting from New York',
      encode(sha256(convert_to('demo-booking-token-103', 'UTF8')), 'hex')
    ),
    (
      'd0000000-0000-4000-8000-000000000104'::uuid,
      v_demo_biz, v_andriy_id, v_svc_fade,
      ((v_base_day + 1)::text || ' 15:00:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day + 1)::text || ' 15:40:00')::timestamp at time zone 'Europe/Kyiv',
      ((v_base_day + 1)::text || ' 15:45:00')::timestamp at time zone 'Europe/Kyiv',
      'confirmed',
      'Iryna Savchenko', 'iryna.savchenko@northside-demo.example', 'Europe/Kyiv',
      null,
      encode(sha256(convert_to('demo-booking-token-104', 'UTF8')), 'hex')
    );

  return jsonb_build_object(
    'demoReset', true,
    'expiredBusinessesDeleted', v_expired_biz_count,
    'expiredUsersDeleted', v_expired_user_count
  );
end;
$$;

revoke execute on function public.reset_demo_and_expired_data() from public, anon, authenticated;
grant execute on function public.reset_demo_and_expired_data() to service_role;

-- Schedule nightly SQL reset at 03:00 UTC cleanly (safe baseline even before Vault HTTP cron is wired on deploy)
select cron.schedule(
  'tendly-nightly-demo-reset',
  '0 3 * * *',
  $$select public.reset_demo_and_expired_data();$$
);
