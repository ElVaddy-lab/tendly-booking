-- Tendly core schema: tenants, members, staff, services, schedules, bookings.
-- All times are timestamptz (UTC); weekly hours are local wall-clock time in the business time zone.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Roles are ordered so that comparisons work: staff < manager < owner.
create type public.member_role as enum ('staff', 'manager', 'owner');
create type public.booking_status as enum ('confirmed', 'completed', 'no_show', 'cancelled');

create function private.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$'),
  name text not null check (char_length(name) between 1 and 80),
  timezone text not null check (private.is_valid_timezone(timezone)),
  min_notice_minutes integer not null default 60 check (min_notice_minutes between 0 and 10080),
  booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365),
  slot_step_minutes integer not null default 15 check (slot_step_minutes in (5, 10, 15, 20, 30, 60)),
  cancellation_deadline_hours integer not null default 24 check (cancellation_deadline_hours between 0 and 168),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_id_idx on public.business_members (user_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  member_user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, member_user_id)
);
create index staff_member_user_id_idx on public.staff (member_user_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  duration_min integer not null check (duration_min between 5 and 480),
  buffer_min integer not null default 0 check (buffer_min between 0 and 120),
  price_cents integer check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create index services_business_id_idx on public.services (business_id);

create table public.staff_services (
  business_id uuid not null,
  staff_id uuid not null,
  service_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (business_id, staff_id) references public.staff (business_id, id) on delete cascade,
  foreign key (business_id, service_id) references public.services (business_id, id) on delete cascade
);
create index staff_services_business_id_idx on public.staff_services (business_id);
create index staff_services_service_id_idx on public.staff_services (service_id);

-- ISO weekday: 1 = Monday … 7 = Sunday. Several rows per day allow breaks.
create table public.weekly_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  staff_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  foreign key (business_id, staff_id) references public.staff (business_id, id) on delete cascade
);
create index weekly_hours_staff_weekday_idx on public.weekly_hours (staff_id, weekday);
create index weekly_hours_business_id_idx on public.weekly_hours (business_id);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  staff_id uuid not null,
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  foreign key (business_id, staff_id) references public.staff (business_id, id) on delete cascade
);
create index time_off_staff_period_idx on public.time_off using gist (staff_id, period);
create index time_off_business_id_idx on public.time_off (business_id);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  staff_id uuid not null,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- End of the service buffer. Stored because timestamptz + interval is STABLE, not IMMUTABLE,
  -- so it cannot be computed inside the exclusion constraint.
  blocked_until timestamptz not null,
  status public.booking_status not null default 'confirmed',
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_email text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(customer_email) <= 254),
  customer_phone text check (char_length(customer_phone) <= 32),
  customer_timezone text check (customer_timezone is null or private.is_valid_timezone(customer_timezone)),
  notes text check (char_length(notes) <= 1000),
  manage_token_hash text unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at and blocked_until >= ends_at),
  foreign key (business_id, staff_id) references public.staff (business_id, id) on delete cascade,
  foreign key (business_id, service_id) references public.services (business_id, id) on delete cascade,
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, blocked_until, '[)') with &&
  ) where (status = 'confirmed')
);
create index bookings_business_starts_idx on public.bookings (business_id, starts_at);
create index bookings_staff_starts_idx on public.bookings (staff_id, starts_at);
create index bookings_service_id_idx on public.bookings (service_id);

-- RLS on everything; policies come in the next migration. No policy = no access through the API.
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;
alter table public.weekly_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.bookings enable row level security;
