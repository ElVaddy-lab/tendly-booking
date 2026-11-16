-- Extend public.create_booking with optional customer notes (p_notes)
-- and an email-scoped sliding-window rate limit for public bookings.

drop function if exists public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, text);

create function public.create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_customer_timezone text default null,
  p_notes text default null
)
returns table (booking_id uuid, staff_id uuid, starts_at timestamptz, ends_at timestamptz, manage_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_customer_email));
  v_notes text := nullif(btrim(p_notes), '');
  v_recent_count int;
  v_staff_id uuid;
  v_duration interval;
  v_blocked interval;
  v_token text;
  v_booking_id uuid;
begin
  select count(*)::int
    into v_recent_count
  from public.bookings b
  where b.business_id = p_business_id
    and b.customer_email = v_email
    and b.status = 'confirmed'
    and b.created_at > now() - interval '10 minutes';

  if v_recent_count >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limit_exceeded';
  end if;

  select make_interval(mins => s.duration_min), make_interval(mins => s.duration_min + s.buffer_min)
    into v_duration, v_blocked
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;

  -- The requested start must be one of the slots offered right now.
  -- For "any staff", prefer the barber with the fewest bookings that day.
  select slot.staff_id
    into v_staff_id
  from private.available_slots_at(p_business_id, p_service_id, p_staff_id, p_starts_at, p_starts_at + interval '1 second', now()) slot
  where slot.starts_at = p_starts_at
  order by (
    select count(*) from public.bookings b
    where b.staff_id = slot.staff_id
      and b.status = 'confirmed'
      and b.starts_at >= p_starts_at - interval '12 hours'
      and b.starts_at < p_starts_at + interval '12 hours'
  ), slot.staff_id
  limit 1;

  if v_staff_id is null or v_duration is null then
    raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  begin
    insert into public.bookings (
      business_id, staff_id, service_id, starts_at, ends_at, blocked_until,
      customer_name, customer_email, customer_phone, customer_timezone, notes, manage_token_hash
    ) values (
      p_business_id, v_staff_id, p_service_id, p_starts_at, p_starts_at + v_duration, p_starts_at + v_blocked,
      btrim(p_customer_name), v_email, nullif(btrim(p_customer_phone), ''), p_customer_timezone,
      v_notes, encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      -- Another request took the slot between our check and our insert.
      raise exception using errcode = 'P0001', message = 'slot_unavailable';
  end;

  return query select v_booking_id, v_staff_id, p_starts_at, p_starts_at + v_duration, v_token;
end;
$$;

revoke execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, text, text) from public;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, text, text) to anon, authenticated, service_role;
