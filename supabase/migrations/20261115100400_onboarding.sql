-- Onboarding RPCs: business creation and initial staff + service + weekly hours setup.
-- Business creation runs as security definer because direct inserts on businesses are closed;
-- initial setup runs as security invoker so existing manager/owner RLS policies enforce access.

create function public.create_business(
  p_name text,
  p_slug text,
  p_timezone text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_timezone text := btrim(coalesce(p_timezone, ''));
  v_business_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if exists (
    select 1
    from public.business_members m
    where m.user_id = v_user_id
      and m.role = 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'already_owns_business';
  end if;

  if v_slug = any (array[
    'admin', 'api', 'auth', 'b', 'dashboard', 'demo', 'login', 'logout',
    'manage', 'onboarding', 'pricing', 'settings', 'sign-in', 'sign-up',
    'stripe', 'tendly', 'webhooks'
  ]) then
    raise exception using errcode = '23514', message = 'slug_reserved';
  end if;

  begin
    insert into public.businesses (name, slug, timezone, created_by)
    values (v_name, v_slug, v_timezone, v_user_id)
    returning id into v_business_id;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'slug_taken';
  end;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  return v_business_id;
end;
$$;

revoke execute on function public.create_business(text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text) to authenticated;

create function public.complete_onboarding(
  p_business_id uuid,
  p_staff_name text,
  p_service_name text,
  p_duration_min integer,
  p_buffer_min integer default 0,
  p_price_cents integer default null,
  p_weekdays smallint[] default array[1, 2, 3, 4, 5]::smallint[],
  p_start_time time default '09:00',
  p_end_time time default '18:00'
)
returns table (staff_id uuid, service_id uuid)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_staff_id uuid;
  v_service_id uuid;
begin
  if coalesce(array_length(p_weekdays, 1), 0) = 0 then
    raise exception using errcode = '23514', message = 'weekdays_required';
  end if;

  insert into public.staff (business_id, member_user_id, display_name)
  values (p_business_id, v_user_id, btrim(coalesce(p_staff_name, '')))
  on conflict (business_id, member_user_id)
  do update set
    display_name = excluded.display_name,
    is_active = true
  returning public.staff.id into v_staff_id;

  insert into public.services (business_id, name, duration_min, buffer_min, price_cents)
  values (
    p_business_id,
    btrim(coalesce(p_service_name, '')),
    p_duration_min,
    coalesce(p_buffer_min, 0),
    p_price_cents
  )
  returning public.services.id into v_service_id;

  insert into public.staff_services (business_id, staff_id, service_id)
  values (p_business_id, v_staff_id, v_service_id)
  on conflict do nothing;

  delete from public.weekly_hours wh
  where wh.business_id = p_business_id
    and wh.staff_id = v_staff_id;

  insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
  select distinct p_business_id, v_staff_id, wd, p_start_time, p_end_time
  from unnest(p_weekdays) as wd;

  return query select v_staff_id, v_service_id;
end;
$$;

revoke execute on function public.complete_onboarding(
  uuid, text, text, integer, integer, integer, smallint[], time, time
) from public, anon;
grant execute on function public.complete_onboarding(
  uuid, text, text, integer, integer, integer, smallint[], time, time
) to authenticated;
