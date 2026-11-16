-- Stage 10: Notification outbox, Telegram bot linking & daily reminders,
-- Supabase Cron schedule, and per-staff .ics calendar subscription feeds.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.staff
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_linked_at timestamptz,
  add column if not exists telegram_link_code_hash text unique,
  add column if not exists telegram_link_expires_at timestamptz,
  add column if not exists ics_token_hash text unique,
  add column if not exists ics_enabled_at timestamptz;

-- Keep chat IDs and token hashes inaccessible through direct Data API queries.
revoke select on public.staff from anon, authenticated;
grant select (
  id,
  business_id,
  member_user_id,
  display_name,
  is_active,
  created_at
) on public.staff to anon;
grant select (
  id,
  business_id,
  member_user_id,
  display_name,
  is_active,
  created_at,
  telegram_linked_at,
  telegram_link_expires_at,
  ics_enabled_at
) on public.staff to authenticated;

revoke update on public.staff from authenticated;
grant update (display_name, is_active, member_user_id)
  on public.staff to authenticated;

create type public.notification_event_type as enum (
  'booking_created',
  'booking_cancelled',
  'booking_rescheduled',
  'daily_digest'
);

create type public.notification_status as enum (
  'pending',
  'sent',
  'failed'
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  event_type public.notification_event_type not null,
  status public.notification_status not null default 'pending',
  telegram_chat_id bigint not null,
  message_text text not null check (char_length(message_text) between 1 and 4000),
  dedupe_key text unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notification_outbox_status_scheduled_idx
  on public.notification_outbox (status, scheduled_for)
  where status in ('pending', 'failed');
create index notification_outbox_business_staff_idx
  on public.notification_outbox (business_id, staff_id, created_at desc);
create index notification_outbox_staff_idx
  on public.notification_outbox (staff_id);
create index notification_outbox_booking_idx
  on public.notification_outbox (booking_id);

alter table public.notification_outbox enable row level security;

revoke all on public.notification_outbox from public, anon, authenticated;
grant select on public.notification_outbox to authenticated;

create policy "Managers see all notifications, staff their own"
  on public.notification_outbox for select
  to authenticated
  using (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );

create function private.enqueue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_biz_name text;
  v_biz_tz text;
  v_svc_name text;
  v_staff_chat_id bigint;
  v_old_staff_chat_id bigint;
  v_when text;
  v_client_label text;
begin
  select b.name, b.timezone
    into v_biz_name, v_biz_tz
  from public.businesses b
  where b.id = NEW.business_id;

  select s.name
    into v_svc_name
  from public.services s
  where s.id = NEW.service_id;

  select st.telegram_chat_id
    into v_staff_chat_id
  from public.staff st
  where st.id = NEW.staff_id
    and st.business_id = NEW.business_id;

  v_when := to_char(NEW.starts_at at time zone v_biz_tz, 'Dy, Mon DD at HH24:MI');
  v_client_label := case
    when NEW.erased_at is not null then 'Client'
    else NEW.customer_name
  end;

  if TG_OP = 'INSERT' then
    if NEW.status = 'confirmed' and v_staff_chat_id is not null then
      insert into public.notification_outbox (
        business_id,
        staff_id,
        booking_id,
        event_type,
        telegram_chat_id,
        message_text,
        dedupe_key
      ) values (
        NEW.business_id,
        NEW.staff_id,
        NEW.id,
        'booking_created',
        v_staff_chat_id,
        format(
          'New booking at %s: %s — %s (%s)',
          v_biz_name,
          v_when,
          coalesce(v_svc_name, 'Appointment'),
          v_client_label
        ),
        'booking_created:' || NEW.id::text
      )
      on conflict (dedupe_key) do nothing;
    end if;

    return NEW;
  end if;

  if OLD.status <> 'cancelled' and NEW.status = 'cancelled' then
    if v_staff_chat_id is not null then
      insert into public.notification_outbox (
        business_id,
        staff_id,
        booking_id,
        event_type,
        telegram_chat_id,
        message_text,
        dedupe_key
      ) values (
        NEW.business_id,
        NEW.staff_id,
        NEW.id,
        'booking_cancelled',
        v_staff_chat_id,
        format(
          'Cancelled booking at %s: %s — %s (%s)',
          v_biz_name,
          v_when,
          coalesce(v_svc_name, 'Appointment'),
          v_client_label
        ),
        'booking_cancelled:' || NEW.id::text || ':' || NEW.staff_id::text
      )
      on conflict (dedupe_key) do nothing;
    end if;

    return NEW;
  end if;

  if NEW.status = 'confirmed'
     and (OLD.starts_at is distinct from NEW.starts_at or OLD.staff_id is distinct from NEW.staff_id) then
    if OLD.staff_id is distinct from NEW.staff_id then
      select st.telegram_chat_id
        into v_old_staff_chat_id
      from public.staff st
      where st.id = OLD.staff_id
        and st.business_id = OLD.business_id;

      if v_old_staff_chat_id is not null then
        insert into public.notification_outbox (
          business_id,
          staff_id,
          booking_id,
          event_type,
          telegram_chat_id,
          message_text
        ) values (
          OLD.business_id,
          OLD.staff_id,
          NEW.id,
          'booking_cancelled',
          v_old_staff_chat_id,
          format(
            'Reassigned booking at %s: %s — %s moved to another specialist',
            v_biz_name,
            to_char(OLD.starts_at at time zone v_biz_tz, 'Dy, Mon DD at HH24:MI'),
            coalesce(v_svc_name, 'Appointment')
          )
        );
      end if;
    end if;

    if v_staff_chat_id is not null then
      insert into public.notification_outbox (
        business_id,
        staff_id,
        booking_id,
        event_type,
        telegram_chat_id,
        message_text
      ) values (
        NEW.business_id,
        NEW.staff_id,
        NEW.id,
        'booking_rescheduled',
        v_staff_chat_id,
        format(
          'Rescheduled booking at %s: %s — %s (%s)',
          v_biz_name,
          v_when,
          coalesce(v_svc_name, 'Appointment'),
          v_client_label
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function private.enqueue_booking_notifications() from public, anon, authenticated;

create trigger bookings_enqueue_notifications_trg
  after insert or update on public.bookings
  for each row
  execute function private.enqueue_booking_notifications();

create function public.create_telegram_link_code(
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

create function public.complete_telegram_link(
  p_link_code text,
  p_telegram_chat_id bigint
)
returns table (
  staff_id uuid,
  business_id uuid,
  staff_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_clean_code text := nullif(btrim(coalesce(p_link_code, '')), '');
  v_hash text;
  v_staff_id uuid;
  v_business_id uuid;
  v_staff_name text;
begin
  if v_clean_code is null or p_telegram_chat_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_or_expired_link_code';
  end if;

  v_hash := encode(sha256(convert_to(v_clean_code, 'UTF8')), 'hex');

  update public.staff st
  set telegram_chat_id = p_telegram_chat_id,
      telegram_linked_at = now(),
      telegram_link_code_hash = null,
      telegram_link_expires_at = null
  where st.telegram_link_code_hash = v_hash
    and st.telegram_link_expires_at > now()
  returning st.id, st.business_id, st.display_name
    into v_staff_id, v_business_id, v_staff_name;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_or_expired_link_code';
  end if;

  return query select v_staff_id, v_business_id, v_staff_name;
end;
$$;

revoke execute on function public.complete_telegram_link(text, bigint) from public, anon, authenticated;
grant execute on function public.complete_telegram_link(text, bigint) to service_role;

create function public.unlink_staff_telegram(
  p_business_id uuid,
  p_staff_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_business_id not in (select private.business_ids_with_role('manager'))
     and p_staff_id not in (select private.own_staff_ids()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.staff st
  set telegram_chat_id = null,
      telegram_linked_at = null,
      telegram_link_code_hash = null,
      telegram_link_expires_at = null
  where st.id = p_staff_id
    and st.business_id = p_business_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;

  delete from public.notification_outbox no
  where no.staff_id = p_staff_id
    and no.business_id = p_business_id
    and no.status = 'pending';
end;
$$;

revoke execute on function public.unlink_staff_telegram(uuid, uuid) from public, anon;
grant execute on function public.unlink_staff_telegram(uuid, uuid) to authenticated, service_role;

create function public.rotate_staff_ics_token(
  p_business_id uuid,
  p_staff_id uuid
)
returns table (
  ics_token text,
  enabled_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text;
  v_enabled timestamptz := now();
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_business_id not in (select private.business_ids_with_role('manager'))
     and p_staff_id not in (select private.own_staff_ids()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.staff st
  set ics_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
      ics_enabled_at = v_enabled
  where st.id = p_staff_id
    and st.business_id = p_business_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;

  return query select v_token, v_enabled;
end;
$$;

revoke execute on function public.rotate_staff_ics_token(uuid, uuid) from public, anon;
grant execute on function public.rotate_staff_ics_token(uuid, uuid) to authenticated, service_role;

create function public.revoke_staff_ics_token(
  p_business_id uuid,
  p_staff_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_business_id not in (select private.business_ids_with_role('manager'))
     and p_staff_id not in (select private.own_staff_ids()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.staff st
  set ics_token_hash = null,
      ics_enabled_at = null
  where st.id = p_staff_id
    and st.business_id = p_business_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;
end;
$$;

revoke execute on function public.revoke_staff_ics_token(uuid, uuid) from public, anon;
grant execute on function public.revoke_staff_ics_token(uuid, uuid) to authenticated, service_role;

create function public.get_staff_calendar_feed(p_token text)
returns table (
  business_name text,
  business_slug text,
  business_timezone text,
  staff_name text,
  booking_id uuid,
  service_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status,
  customer_name text,
  notes text
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
      biz.name,
      biz.slug,
      biz.timezone,
      st.display_name,
      b.id,
      svc.name,
      b.starts_at,
      b.ends_at,
      b.status,
      case
        when b.id is null then null
        when b.erased_at is not null then 'Client'
        else b.customer_name
      end,
      case
        when b.id is null or b.erased_at is not null then null
        else b.notes
      end
    from public.staff st
    join public.businesses biz on biz.id = st.business_id
    left join public.bookings b
      on b.staff_id = st.id
     and b.business_id = st.business_id
     and b.status in ('confirmed', 'completed')
     and b.starts_at >= now() - interval '30 days'
    left join public.services svc
      on svc.id = b.service_id
     and svc.business_id = b.business_id
    where st.ics_token_hash = v_hash
      and st.is_active
    order by b.starts_at asc nulls first;
end;
$$;

revoke execute on function public.get_staff_calendar_feed(text) from public;
grant execute on function public.get_staff_calendar_feed(text) to anon, authenticated, service_role;

create function public.enqueue_daily_staff_reminders(
  p_now timestamptz default now()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  with digests as (
    select
      biz.id as business_id,
      st.id as staff_id,
      st.telegram_chat_id,
      (p_now at time zone biz.timezone)::date as local_day,
      biz.name as business_name,
      count(b.id)::int as booking_count,
      string_agg(
        to_char(b.starts_at at time zone biz.timezone, 'HH24:MI')
        || '–'
        || to_char(b.ends_at at time zone biz.timezone, 'HH24:MI')
        || ' · '
        || coalesce(svc.name, 'Appointment')
        || ' ('
        || case when b.erased_at is not null then 'Client' else b.customer_name end
        || ')',
        E'\n'
        order by b.starts_at
      ) as lines
    from public.staff st
    join public.businesses biz on biz.id = st.business_id
    join public.bookings b
      on b.staff_id = st.id
     and b.business_id = st.business_id
     and b.status = 'confirmed'
     and (b.starts_at at time zone biz.timezone)::date = (p_now at time zone biz.timezone)::date
    left join public.services svc
      on svc.id = b.service_id
     and svc.business_id = b.business_id
    where st.is_active
      and st.telegram_chat_id is not null
    group by biz.id, st.id, st.telegram_chat_id, (p_now at time zone biz.timezone)::date, biz.name
  ),
  inserted as (
    insert into public.notification_outbox (
      business_id,
      staff_id,
      booking_id,
      event_type,
      telegram_chat_id,
      message_text,
      dedupe_key
    )
    select
      d.business_id,
      d.staff_id,
      null,
      'daily_digest',
      d.telegram_chat_id,
      left(
        format(
          'Daily schedule for %s at %s (%s):%s%s',
          to_char(d.local_day, 'YYYY-MM-DD'),
          d.business_name,
          d.booking_count::text,
          E'\n',
          d.lines
        ),
        4000
      ),
      'daily_digest:' || d.staff_id::text || ':' || to_char(d.local_day, 'YYYY-MM-DD')
    from digests d
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::int
    into v_inserted
  from inserted;

  return v_inserted;
end;
$$;

revoke execute on function public.enqueue_daily_staff_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_daily_staff_reminders(timestamptz) to service_role;

select cron.schedule(
  'tendly-enqueue-daily-reminders',
  '*/15 * * * *',
  $$select public.enqueue_daily_staff_reminders(now());$$
);
