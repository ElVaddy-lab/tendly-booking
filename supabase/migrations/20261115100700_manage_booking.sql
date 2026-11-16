-- Customer booking management via secret token (view, reschedule, cancel).
-- Anonymous visitors have no table privileges on public.bookings; all reads and mutations
-- go through security definer RPCs keyed by SHA-256 of the manage token and enforced
-- against the shop's cancellation deadline and token retention window.

create function private.available_slots_excluding(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_now timestamptz,
  p_exclude_booking_id uuid default null
)
returns table (staff_id uuid, starts_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with biz as (
    select b.timezone as tz, b.slot_step_minutes as step, b.min_notice_minutes as notice, b.booking_horizon_days as horizon
    from public.businesses b
    where b.id = p_business_id
  ),
  svc as (
    select make_interval(mins => s.duration_min) as duration,
           make_interval(mins => s.duration_min + s.buffer_min) as blocked
    from public.services s
    where s.id = p_service_id and s.business_id = p_business_id and s.is_active
  ),
  bookable_staff as (
    select st.id
    from public.staff st
    join public.staff_services ss on ss.staff_id = st.id and ss.service_id = p_service_id
    where st.business_id = p_business_id
      and st.is_active
      and (p_staff_id is null or st.id = p_staff_id)
  ),
  bounds as (
    select greatest(p_from, p_now + make_interval(mins => biz.notice)) as lo,
           least(p_to, p_now + make_interval(days => biz.horizon)) as hi
    from biz
  ),
  local_days as (
    select d::date as day
    from bounds, biz,
         generate_series((bounds.lo at time zone biz.tz)::date, (bounds.hi at time zone biz.tz)::date, interval '1 day') d
  ),
  windows as (
    select wh.staff_id, ld.day, wh.start_time, wh.end_time,
           (ld.day + wh.end_time) at time zone biz.tz as window_end
    from local_days ld
    cross join biz
    join public.weekly_hours wh on wh.weekday = extract(isodow from ld.day)
    join bookable_staff bs on bs.id = wh.staff_id
  ),
  candidates as (
    select distinct w.staff_id, (local_start at time zone biz.tz) as starts_at, w.window_end
    from windows w
    cross join biz
    cross join lateral generate_series(w.day + w.start_time, w.day + w.end_time, make_interval(mins => biz.step)) local_start
  )
  select c.staff_id, c.starts_at
  from candidates c
  cross join svc
  cross join bounds
  where c.starts_at + svc.duration <= c.window_end
    and c.starts_at >= bounds.lo
    and c.starts_at < bounds.hi
    and not exists (
      select 1 from public.time_off t
      where t.staff_id = c.staff_id
        and t.period && tstzrange(c.starts_at, c.starts_at + svc.duration, '[)')
    )
    and not exists (
      select 1 from public.bookings b
      where b.staff_id = c.staff_id
        and b.status = 'confirmed'
        and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
        and tstzrange(b.starts_at, b.blocked_until, '[)') && tstzrange(c.starts_at, c.starts_at + svc.blocked, '[)')
    )
  order by c.starts_at, c.staff_id;
$$;

revoke execute on function private.available_slots_excluding(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Delegate the 6-arg internal wrapper to keep existing callers unambiguous.
create or replace function private.available_slots_at(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_now timestamptz
)
returns table (staff_id uuid, starts_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select s.staff_id, s.starts_at
  from private.available_slots_excluding(
    p_business_id, p_service_id, p_staff_id, p_from, p_to, p_now, null::uuid
  ) s;
$$;

create function public.get_booking_by_token(p_token text)
returns table (
  booking_id uuid,
  business_id uuid,
  business_slug text,
  business_name text,
  business_timezone text,
  business_is_demo boolean,
  cancellation_deadline_hours integer,
  booking_horizon_days integer,
  slot_step_minutes integer,
  min_notice_minutes integer,
  service_id uuid,
  service_name text,
  service_duration_min integer,
  service_buffer_min integer,
  service_price_cents integer,
  service_currency text,
  service_is_active boolean,
  staff_id uuid,
  staff_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status,
  customer_name text,
  customer_timezone text,
  notes text,
  created_at timestamptz,
  cancelled_at timestamptz,
  deadline_at timestamptz,
  can_cancel boolean,
  can_reschedule boolean,
  token_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_hash text;
begin
  if v_raw_token is null then
    return;
  end if;

  v_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  return query
    select
      b.id,
      biz.id,
      biz.slug,
      biz.name,
      biz.timezone,
      biz.is_demo,
      biz.cancellation_deadline_hours,
      biz.booking_horizon_days,
      biz.slot_step_minutes,
      biz.min_notice_minutes,
      svc.id,
      svc.name,
      svc.duration_min,
      svc.buffer_min,
      svc.price_cents,
      svc.currency,
      svc.is_active,
      st.id,
      st.display_name,
      b.starts_at,
      b.ends_at,
      b.status,
      b.customer_name,
      b.customer_timezone,
      b.notes,
      b.created_at,
      b.cancelled_at,
      b.starts_at - make_interval(hours => biz.cancellation_deadline_hours),
      (b.status = 'confirmed' and now() < (b.starts_at - make_interval(hours => biz.cancellation_deadline_hours))),
      (b.status = 'confirmed' and svc.is_active and now() < (b.starts_at - make_interval(hours => biz.cancellation_deadline_hours))),
      coalesce(b.cancelled_at, b.ends_at) + interval '30 days'
    from public.bookings b
    join public.businesses biz on biz.id = b.business_id
    join public.services svc on svc.id = b.service_id and svc.business_id = b.business_id
    join public.staff st on st.id = b.staff_id and st.business_id = b.business_id
    where b.manage_token_hash = v_hash
      and coalesce(b.cancelled_at, b.ends_at) + interval '30 days' > now();
end;
$$;

revoke execute on function public.get_booking_by_token(text) from public;
grant execute on function public.get_booking_by_token(text) to anon, authenticated, service_role;

create function public.available_slots_for_reschedule(
  p_token text,
  p_staff_id uuid default null,
  p_from timestamptz default now(),
  p_to timestamptz default now() + interval '7 days'
)
returns table (staff_id uuid, starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_hash text;
  v_booking_id uuid;
  v_business_id uuid;
  v_service_id uuid;
  v_status public.booking_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cancelled_at timestamptz;
  v_deadline_hours integer;
begin
  if p_to - p_from > interval '14 days' then
    raise exception using errcode = '22023', message = 'range_too_long', detail = 'Request at most 14 days of slots at once.';
  end if;

  if v_raw_token is null then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  v_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  select
    b.id, b.business_id, b.service_id, b.status, b.starts_at, b.ends_at, b.cancelled_at, biz.cancellation_deadline_hours
    into v_booking_id, v_business_id, v_service_id, v_status, v_starts_at, v_ends_at, v_cancelled_at, v_deadline_hours
  from public.bookings b
  join public.businesses biz on biz.id = b.business_id
  where b.manage_token_hash = v_hash;

  if not found or coalesce(v_cancelled_at, v_ends_at) + interval '30 days' <= now() then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  if v_status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'booking_not_confirmed';
  end if;

  if now() >= v_starts_at - make_interval(hours => v_deadline_hours) then
    raise exception using errcode = 'P0001', message = 'deadline_passed';
  end if;

  return query
    select s.staff_id, s.starts_at
    from private.available_slots_excluding(
      v_business_id, v_service_id, p_staff_id, p_from, p_to, now(), v_booking_id
    ) s;
end;
$$;

revoke execute on function public.available_slots_for_reschedule(text, uuid, timestamptz, timestamptz) from public;
grant execute on function public.available_slots_for_reschedule(text, uuid, timestamptz, timestamptz) to anon, authenticated, service_role;

create function public.cancel_booking(p_token text)
returns table (booking_id uuid, status public.booking_status, cancelled_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_raw_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_hash text;
  v_row public.bookings%rowtype;
  v_deadline_hours integer;
begin
  if v_raw_token is null then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  v_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  select b.*, biz.cancellation_deadline_hours
    into v_row.id, v_row.business_id, v_row.staff_id, v_row.service_id,
         v_row.starts_at, v_row.ends_at, v_row.blocked_until, v_row.status,
         v_row.customer_name, v_row.customer_email, v_row.customer_phone,
         v_row.customer_timezone, v_row.notes, v_row.manage_token_hash,
         v_row.created_at, v_row.cancelled_at, v_deadline_hours
  from public.bookings b
  join public.businesses biz on biz.id = b.business_id
  where b.manage_token_hash = v_hash
  for update of b;

  if not found or coalesce(v_row.cancelled_at, v_row.ends_at) + interval '30 days' <= now() then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  if v_row.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'booking_not_confirmed';
  end if;

  if now() >= v_row.starts_at - make_interval(hours => v_deadline_hours) then
    raise exception using errcode = 'P0001', message = 'deadline_passed';
  end if;

  return query
    update public.bookings b
    set status = 'cancelled',
        cancelled_at = now()
    where b.id = v_row.id
    returning b.id, b.status, b.cancelled_at;
end;
$$;

revoke execute on function public.cancel_booking(text) from public;
grant execute on function public.cancel_booking(text) to anon, authenticated, service_role;

create function public.reschedule_booking(
  p_token text,
  p_staff_id uuid,
  p_starts_at timestamptz
)
returns table (booking_id uuid, staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_raw_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_hash text;
  v_row public.bookings%rowtype;
  v_deadline_hours integer;
  v_duration interval;
  v_blocked interval;
  v_staff_id uuid;
begin
  if v_raw_token is null then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  v_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  select b.*, biz.cancellation_deadline_hours
    into v_row.id, v_row.business_id, v_row.staff_id, v_row.service_id,
         v_row.starts_at, v_row.ends_at, v_row.blocked_until, v_row.status,
         v_row.customer_name, v_row.customer_email, v_row.customer_phone,
         v_row.customer_timezone, v_row.notes, v_row.manage_token_hash,
         v_row.created_at, v_row.cancelled_at, v_deadline_hours
  from public.bookings b
  join public.businesses biz on biz.id = b.business_id
  where b.manage_token_hash = v_hash
  for update of b;

  if not found or coalesce(v_row.cancelled_at, v_row.ends_at) + interval '30 days' <= now() then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  if v_row.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'booking_not_confirmed';
  end if;

  if now() >= v_row.starts_at - make_interval(hours => v_deadline_hours) then
    raise exception using errcode = 'P0001', message = 'deadline_passed';
  end if;

  select make_interval(mins => s.duration_min), make_interval(mins => s.duration_min + s.buffer_min)
    into v_duration, v_blocked
  from public.services s
  where s.id = v_row.service_id
    and s.business_id = v_row.business_id
    and s.is_active;

  if v_duration is null then
    raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end if;

  -- Check against live slots excluding this booking itself so small adjustments remain possible.
  -- In "Anyone available" mode (p_staff_id is null), pick the least-booked eligible staff that day.
  select slot.staff_id
    into v_staff_id
  from private.available_slots_excluding(
    v_row.business_id,
    v_row.service_id,
    p_staff_id,
    p_starts_at,
    p_starts_at + interval '1 second',
    now(),
    v_row.id
  ) slot
  where slot.starts_at = p_starts_at
  order by (
    select count(*) from public.bookings b
    where b.staff_id = slot.staff_id
      and b.id <> v_row.id
      and b.status = 'confirmed'
      and b.starts_at >= p_starts_at - interval '12 hours'
      and b.starts_at < p_starts_at + interval '12 hours'
  ), slot.staff_id
  limit 1;

  if v_staff_id is null then
    raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end if;

  begin
    return query
      update public.bookings b
      set staff_id = v_staff_id,
          starts_at = p_starts_at,
          ends_at = p_starts_at + v_duration,
          blocked_until = p_starts_at + v_blocked
      where b.id = v_row.id
      returning b.id, b.staff_id, b.starts_at, b.ends_at;
  exception
    when exclusion_violation then
      raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end;
end;
$$;

revoke execute on function public.reschedule_booking(text, uuid, timestamptz) from public;
grant execute on function public.reschedule_booking(text, uuid, timestamptz) to anon, authenticated, service_role;
