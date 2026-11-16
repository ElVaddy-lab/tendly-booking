-- Stage 11: Stripe subscriptions, webhook idempotency log, and DB-enforced plan limits.

create type public.plan_tier as enum ('free', 'pro');

create type public.subscription_status as enum (
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused'
);

create table public.business_subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan_tier public.plan_tier not null default 'free',
  status public.subscription_status not null default 'active',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.business_subscriptions enable row level security;

revoke all on public.business_subscriptions from public, anon, authenticated;
grant select (
  business_id,
  plan_tier,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  updated_at,
  created_at
) on public.business_subscriptions to authenticated;

create policy "Members see their business subscription"
  on public.business_subscriptions for select
  to authenticated
  using (business_id in (select private.business_ids_with_role('staff')));

create table public.stripe_events (
  id text primary key check (char_length(id) between 1 and 128),
  event_type text not null check (char_length(event_type) between 1 and 128),
  business_id uuid references public.businesses (id) on delete set null,
  processed_at timestamptz not null default now()
);

create index stripe_events_business_id_idx
  on public.stripe_events (business_id);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;

create function private.is_business_pro(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_subscriptions bs
    where bs.business_id = p_business_id
      and bs.plan_tier = 'pro'
      and bs.status in ('active', 'trialing')
  );
$$;

revoke all on function private.is_business_pro(uuid) from public, anon, authenticated;

create function private.enforce_staff_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if not NEW.is_active then
    return NEW;
  end if;

  perform 1
  from public.businesses b
  where b.id = NEW.business_id
  for update;

  v_limit := case when private.is_business_pro(NEW.business_id) then 10 else 3 end;

  select count(*)::int
    into v_count
  from public.staff st
  where st.business_id = NEW.business_id
    and st.is_active
    and st.id is distinct from NEW.id;

  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = 'plan_limit_staff';
  end if;

  return NEW;
end;
$$;

revoke all on function private.enforce_staff_plan_limit() from public, anon, authenticated;

create trigger staff_enforce_plan_limit_trg
  before insert or update of is_active, business_id on public.staff
  for each row
  execute function private.enforce_staff_plan_limit();

create function private.enforce_service_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not NEW.is_active then
    return NEW;
  end if;

  perform 1
  from public.businesses b
  where b.id = NEW.business_id
  for update;

  if private.is_business_pro(NEW.business_id) then
    return NEW;
  end if;

  select count(*)::int
    into v_count
  from public.services sv
  where sv.business_id = NEW.business_id
    and sv.is_active
    and sv.id is distinct from NEW.id;

  if v_count >= 5 then
    raise exception using errcode = 'P0001', message = 'plan_limit_services';
  end if;

  return NEW;
end;
$$;

revoke all on function private.enforce_service_plan_limit() from public, anon, authenticated;

create trigger services_enforce_plan_limit_trg
  before insert or update of is_active, business_id on public.services
  for each row
  execute function private.enforce_service_plan_limit();

create function private.enforce_booking_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_count integer;
begin
  if NEW.status = 'cancelled' then
    return NEW;
  end if;

  select b.timezone
    into v_timezone
  from public.businesses b
  where b.id = NEW.business_id
  for update;

  if v_timezone is null or private.is_business_pro(NEW.business_id) then
    return NEW;
  end if;

  v_month_start := date_trunc('month', NEW.starts_at at time zone v_timezone) at time zone v_timezone;
  v_month_end := (date_trunc('month', NEW.starts_at at time zone v_timezone) + interval '1 month') at time zone v_timezone;

  select count(*)::int
    into v_count
  from public.bookings bk
  where bk.business_id = NEW.business_id
    and bk.status <> 'cancelled'
    and bk.starts_at >= v_month_start
    and bk.starts_at < v_month_end
    and bk.id is distinct from NEW.id;

  if v_count >= 100 then
    raise exception using errcode = 'P0001', message = 'plan_limit_bookings';
  end if;

  return NEW;
end;
$$;

revoke all on function private.enforce_booking_plan_limit() from public, anon, authenticated;

create trigger bookings_enforce_plan_limit_trg
  before insert or update of status, starts_at, business_id on public.bookings
  for each row
  execute function private.enforce_booking_plan_limit();

create function public.get_business_plan_usage(p_business_id uuid)
returns table (
  plan_tier public.plan_tier,
  subscription_status public.subscription_status,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  has_stripe_customer boolean,
  active_staff_count integer,
  max_staff integer,
  active_services_count integer,
  max_services integer,
  monthly_bookings_count integer,
  max_monthly_bookings integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_timezone text;
  v_plan_tier public.plan_tier := 'free'::public.plan_tier;
  v_sub_status public.subscription_status := 'active'::public.subscription_status;
  v_period_end timestamptz := null;
  v_cancel_at_end boolean := false;
  v_has_customer boolean := false;
  v_is_pro boolean := false;
  v_staff_count integer := 0;
  v_services_count integer := 0;
  v_bookings_count integer := 0;
  v_month_start timestamptz;
  v_month_end timestamptz;
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('staff')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select b.timezone
    into v_timezone
  from public.businesses b
  where b.id = p_business_id;

  if v_timezone is null then
    raise exception using errcode = 'P0001', message = 'business_not_found';
  end if;

  select
    bs.plan_tier,
    bs.status,
    bs.current_period_end,
    bs.cancel_at_period_end,
    (bs.stripe_customer_id is not null)
    into v_plan_tier, v_sub_status, v_period_end, v_cancel_at_end, v_has_customer
  from public.business_subscriptions bs
  where bs.business_id = p_business_id;

  v_plan_tier := coalesce(v_plan_tier, 'free'::public.plan_tier);
  v_sub_status := coalesce(v_sub_status, 'active'::public.subscription_status);
  v_cancel_at_end := coalesce(v_cancel_at_end, false);
  v_has_customer := coalesce(v_has_customer, false);
  v_is_pro := (v_plan_tier = 'pro' and v_sub_status in ('active', 'trialing'));

  select count(*)::int
    into v_staff_count
  from public.staff st
  where st.business_id = p_business_id
    and st.is_active;

  select count(*)::int
    into v_services_count
  from public.services sv
  where sv.business_id = p_business_id
    and sv.is_active;

  v_month_start := date_trunc('month', now() at time zone v_timezone) at time zone v_timezone;
  v_month_end := (date_trunc('month', now() at time zone v_timezone) + interval '1 month') at time zone v_timezone;

  select count(*)::int
    into v_bookings_count
  from public.bookings bk
  where bk.business_id = p_business_id
    and bk.status <> 'cancelled'
    and bk.starts_at >= v_month_start
    and bk.starts_at < v_month_end;

  return query
    select
      case when v_is_pro then 'pro'::public.plan_tier else 'free'::public.plan_tier end,
      v_sub_status,
      v_period_end,
      v_cancel_at_end,
      v_has_customer,
      v_staff_count,
      case when v_is_pro then 10 else 3 end,
      v_services_count,
      case when v_is_pro then null::integer else 5 end,
      v_bookings_count,
      case when v_is_pro then null::integer else 100 end;
end;
$$;

revoke execute on function public.get_business_plan_usage(uuid) from public, anon;
grant execute on function public.get_business_plan_usage(uuid) to authenticated, service_role;
