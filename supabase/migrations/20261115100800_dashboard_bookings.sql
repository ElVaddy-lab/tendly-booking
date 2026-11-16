-- Stage 9: Admin dashboard calendar, manual bookings, status updates, and customer data erasure.

alter table public.bookings
  add column if not exists erased_at timestamptz;

create function public.create_manual_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_notes text default null
)
returns table (
  booking_id uuid,
  staff_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  manage_token text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_manager boolean;
  v_duration interval;
  v_blocked interval;
  v_email text := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_token text;
  v_booking_id uuid;
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_is_manager := p_business_id in (select private.business_ids_with_role('manager'));
  if not v_is_manager and p_staff_id not in (select private.own_staff_ids()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if not exists (
    select 1
    from public.staff st
    where st.id = p_staff_id
      and st.business_id = p_business_id
      and st.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;

  select make_interval(mins => s.duration_min), make_interval(mins => s.duration_min + s.buffer_min)
    into v_duration, v_blocked
  from public.services s
  where s.id = p_service_id
    and s.business_id = p_business_id
    and s.is_active;

  if v_duration is null then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;

  if v_email is null then
    v_email := 'walkin+' || replace(gen_random_uuid()::text, '-', '') || '@walkin.invalid';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  begin
    insert into public.bookings (
      business_id,
      staff_id,
      service_id,
      starts_at,
      ends_at,
      blocked_until,
      customer_name,
      customer_email,
      customer_phone,
      customer_timezone,
      notes,
      manage_token_hash
    ) values (
      p_business_id,
      p_staff_id,
      p_service_id,
      p_starts_at,
      p_starts_at + v_duration,
      p_starts_at + v_blocked,
      btrim(p_customer_name),
      v_email,
      nullif(btrim(coalesce(p_customer_phone, '')), ''),
      null,
      v_notes,
      encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end;

  return query select v_booking_id, p_staff_id, p_starts_at, p_starts_at + v_duration, v_token;
end;
$$;

revoke execute on function public.create_manual_booking(uuid, uuid, uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.create_manual_booking(uuid, uuid, uuid, timestamptz, text, text, text, text) to authenticated, service_role;

create function public.update_booking_status(
  p_business_id uuid,
  p_booking_id uuid,
  p_status public.booking_status
)
returns table (
  booking_id uuid,
  status public.booking_status,
  cancelled_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_row public.bookings%rowtype;
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select b.*
    into v_row
  from public.bookings b
  where b.id = p_booking_id
    and b.business_id = p_business_id
  for update of b;

  if not found then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  if p_business_id not in (select private.business_ids_with_role('manager'))
     and v_row.staff_id not in (select private.own_staff_ids()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if v_row.status = 'cancelled' and p_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'booking_already_cancelled';
  end if;

  return query
    update public.bookings b
    set status = p_status,
        cancelled_at = case
          when p_status = 'cancelled' then coalesce(v_row.cancelled_at, now())
          else null
        end
    where b.id = v_row.id
    returning b.id, b.status, b.cancelled_at;
end;
$$;

revoke execute on function public.update_booking_status(uuid, uuid, public.booking_status) from public, anon;
grant execute on function public.update_booking_status(uuid, uuid, public.booking_status) to authenticated, service_role;

create function public.erase_booking_customer_data(
  p_business_id uuid,
  p_booking_id uuid
)
returns table (
  booking_id uuid,
  status public.booking_status,
  erased_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_row public.bookings%rowtype;
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('manager')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select b.*
    into v_row
  from public.bookings b
  where b.id = p_booking_id
    and b.business_id = p_business_id
  for update of b;

  if not found then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  return query
    update public.bookings b
    set customer_name = 'Erased customer',
        customer_email = 'erased+' || b.id::text || '@redacted.invalid',
        customer_phone = null,
        customer_timezone = null,
        notes = null,
        manage_token_hash = null,
        erased_at = coalesce(b.erased_at, now()),
        status = case
          when b.status = 'confirmed' and b.starts_at > now() then 'cancelled'::public.booking_status
          else b.status
        end,
        cancelled_at = case
          when b.status = 'confirmed' and b.starts_at > now() then coalesce(b.cancelled_at, now())
          else b.cancelled_at
        end
    where b.id = v_row.id
    returning b.id, b.status, b.erased_at;
end;
$$;

revoke execute on function public.erase_booking_customer_data(uuid, uuid) from public, anon;
grant execute on function public.erase_booking_customer_data(uuid, uuid) to authenticated, service_role;

-- Refresh cancel_booking and reschedule_booking with explicit column lists so adding
-- columns (such as erased_at) to public.bookings never misaligns SELECT INTO targets.
create or replace function public.cancel_booking(p_token text)
returns table (booking_id uuid, status public.booking_status, cancelled_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_raw_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_hash text;
  v_id uuid;
  v_status public.booking_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cancelled_at timestamptz;
  v_deadline_hours integer;
begin
  if v_raw_token is null then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  v_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  select
    b.id,
    b.status,
    b.starts_at,
    b.ends_at,
    b.cancelled_at,
    biz.cancellation_deadline_hours
    into v_id, v_status, v_starts_at, v_ends_at, v_cancelled_at, v_deadline_hours
  from public.bookings b
  join public.businesses biz on biz.id = b.business_id
  where b.manage_token_hash = v_hash
  for update of b;

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
    update public.bookings b
    set status = 'cancelled',
        cancelled_at = now()
    where b.id = v_id
    returning b.id, b.status, b.cancelled_at;
end;
$$;

create or replace function public.reschedule_booking(
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
  v_id uuid;
  v_business_id uuid;
  v_service_id uuid;
  v_status public.booking_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cancelled_at timestamptz;
  v_deadline_hours integer;
  v_duration interval;
  v_blocked interval;
  v_staff_id uuid;
begin
  if v_raw_token is null then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  v_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  select
    b.id,
    b.business_id,
    b.service_id,
    b.status,
    b.starts_at,
    b.ends_at,
    b.cancelled_at,
    biz.cancellation_deadline_hours
    into v_id, v_business_id, v_service_id, v_status, v_starts_at, v_ends_at, v_cancelled_at, v_deadline_hours
  from public.bookings b
  join public.businesses biz on biz.id = b.business_id
  where b.manage_token_hash = v_hash
  for update of b;

  if not found or coalesce(v_cancelled_at, v_ends_at) + interval '30 days' <= now() then
    raise exception using errcode = 'P0001', message = 'booking_not_found';
  end if;

  if v_status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'booking_not_confirmed';
  end if;

  if now() >= v_starts_at - make_interval(hours => v_deadline_hours) then
    raise exception using errcode = 'P0001', message = 'deadline_passed';
  end if;

  select make_interval(mins => s.duration_min), make_interval(mins => s.duration_min + s.buffer_min)
    into v_duration, v_blocked
  from public.services s
  where s.id = v_service_id
    and s.business_id = v_business_id
    and s.is_active;

  if v_duration is null then
    raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end if;

  select slot.staff_id
    into v_staff_id
  from private.available_slots_excluding(
    v_business_id,
    v_service_id,
    p_staff_id,
    p_starts_at,
    p_starts_at + interval '1 second',
    now(),
    v_id
  ) slot
  where slot.starts_at = p_starts_at
  order by (
    select count(*) from public.bookings b
    where b.staff_id = slot.staff_id
      and b.id <> v_id
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
      where b.id = v_id
      returning b.id, b.staff_id, b.starts_at, b.ends_at;
  exception
    when exclusion_violation then
      raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end;
end;
$$;
