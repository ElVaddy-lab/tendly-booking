-- Slot generation.
-- The grid is built in the business's local wall-clock time and only then converted to UTC,
-- so DST switches never shift a 09:00 slot to 08:00 or 10:00. Nonexistent local times on the
-- spring-forward night collapse onto real instants; DISTINCT removes the duplicates.

create function private.available_slots_at(
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
        and tstzrange(b.starts_at, b.blocked_until, '[)') && tstzrange(c.starts_at, c.starts_at + svc.blocked, '[)')
    )
  order by c.starts_at, c.staff_id;
$$;

revoke execute on function private.available_slots_at(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

-- Public entry point: always uses the real clock and returns no personal data.
create function public.available_slots(
  p_business_id uuid,
  p_service_id uuid,
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
begin
  if p_to - p_from > interval '14 days' then
    raise exception using errcode = '22023', message = 'range_too_long', detail = 'Request at most 14 days of slots at once.';
  end if;

  return query
    select s.staff_id, s.starts_at
    from private.available_slots_at(p_business_id, p_service_id, p_staff_id, p_from, p_to, now()) s;
end;
$$;

revoke execute on function public.available_slots(uuid, uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.available_slots(uuid, uuid, uuid, timestamptz, timestamptz) to anon, authenticated;
