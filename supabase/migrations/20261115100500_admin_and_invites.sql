-- Admin schedule replacement and role-based team invitations.

-- Atomically replace a staff member's weekly hours. Expects a JSON array of
-- { "weekday": 1..7, "start_time": "HH:MM", "end_time": "HH:MM" } objects.
create function public.set_staff_weekly_hours(
  p_business_id uuid,
  p_staff_id uuid,
  p_hours jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_business_id not in (select private.business_ids_with_role('manager')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if not exists (
    select 1
    from public.staff s
    where s.id = p_staff_id
      and s.business_id = p_business_id
  ) then
    raise exception using errcode = 'P0002', message = 'staff_not_found';
  end if;

  delete from public.weekly_hours wh
  where wh.business_id = p_business_id
    and wh.staff_id = p_staff_id;

  insert into public.weekly_hours (business_id, staff_id, weekday, start_time, end_time)
  select
    p_business_id,
    p_staff_id,
    (item ->> 'weekday')::smallint,
    (item ->> 'start_time')::time,
    (item ->> 'end_time')::time
  from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) as item;

  if exists (
    select 1
    from public.weekly_hours a
    join public.weekly_hours b
      on a.business_id = b.business_id
     and a.staff_id = b.staff_id
     and a.weekday = b.weekday
     and a.id < b.id
    where a.business_id = p_business_id
      and a.staff_id = p_staff_id
      and tsrange(date '2000-01-01' + a.start_time, date '2000-01-01' + a.end_time, '[)')
       && tsrange(date '2000-01-01' + b.start_time, date '2000-01-01' + b.end_time, '[)')
  ) then
    raise exception using errcode = '23514', message = 'overlapping_weekly_hours';
  end if;
end;
$$;

revoke execute on function public.set_staff_weekly_hours(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_staff_weekly_hours(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Business invitations: token is returned once on creation; only SHA-256 is stored.
-- ---------------------------------------------------------------------------
create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  role public.member_role not null check (role in ('staff', 'manager')),
  staff_id uuid,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id, staff_id) references public.staff (business_id, id) on delete cascade
);
create index business_invitations_business_id_idx on public.business_invitations (business_id);

alter table public.business_invitations enable row level security;

revoke all on public.business_invitations from public, anon, authenticated;
grant select, delete on public.business_invitations to authenticated;

create policy "Owners see invitations of their business"
  on public.business_invitations for select
  to authenticated
  using (business_id in (select private.business_ids_with_role('owner')));

create policy "Owners delete invitations of their business"
  on public.business_invitations for delete
  to authenticated
  using (business_id in (select private.business_ids_with_role('owner')));

create function public.create_business_invitation(
  p_business_id uuid,
  p_role public.member_role,
  p_staff_id uuid default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_linked_user_id uuid;
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if v_user_id is null or p_business_id not in (select private.business_ids_with_role('owner')) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_role not in ('staff', 'manager') then
    raise exception using errcode = '23514', message = 'invalid_invite_role';
  end if;

  if p_staff_id is not null then
    if p_role <> 'staff' then
      raise exception using errcode = '23514', message = 'staff_invite_requires_staff_role';
    end if;

    select s.member_user_id
      into v_linked_user_id
    from public.staff s
    where s.id = p_staff_id
      and s.business_id = p_business_id;

    if not found then
      raise exception using errcode = '23514', message = 'staff_not_found';
    end if;

    if v_linked_user_id is not null then
      raise exception using errcode = '23514', message = 'staff_already_linked';
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.business_invitations (
    business_id,
    role,
    staff_id,
    token_hash,
    created_by
  ) values (
    p_business_id,
    p_role,
    p_staff_id,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_user_id
  )
  returning public.business_invitations.id, public.business_invitations.expires_at
    into v_invitation_id, v_expires_at;

  return query select v_invitation_id, v_token, v_expires_at;
end;
$$;

revoke execute on function public.create_business_invitation(uuid, public.member_role, uuid) from public, anon;
grant execute on function public.create_business_invitation(uuid, public.member_role, uuid) to authenticated;

create function public.get_business_invitation(p_token text)
returns table (
  invitation_id uuid,
  business_id uuid,
  business_name text,
  business_slug text,
  role public.member_role,
  staff_id uuid,
  staff_name text,
  expires_at timestamptz,
  is_valid boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(sha256(convert_to(btrim(coalesce(p_token, '')), 'UTF8')), 'hex');
begin
  return query
    select
      i.id,
      b.id,
      b.name,
      b.slug,
      i.role,
      i.staff_id,
      s.display_name,
      i.expires_at,
      (i.accepted_at is null and i.expires_at > now())
    from public.business_invitations i
    join public.businesses b on b.id = i.business_id
    left join public.staff s on s.id = i.staff_id and s.business_id = i.business_id
    where i.token_hash = v_hash;
end;
$$;

revoke execute on function public.get_business_invitation(text) from public;
grant execute on function public.get_business_invitation(text) to anon, authenticated;

create function public.accept_business_invitation(
  p_token text,
  p_display_name text default null
)
returns table (business_id uuid, role public.member_role)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hash text := encode(sha256(convert_to(btrim(coalesce(p_token, '')), 'UTF8')), 'hex');
  v_inv public.business_invitations%rowtype;
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select i.*
    into v_inv
  from public.business_invitations i
  where i.token_hash = v_hash
  for update;

  if not found or v_inv.accepted_at is not null or v_inv.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'invitation_invalid_or_expired';
  end if;

  if exists (
    select 1
    from public.business_members m
    where m.business_id = v_inv.business_id
      and m.user_id = v_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'already_business_member';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_inv.business_id, v_user_id, v_inv.role);

  if v_inv.staff_id is not null then
    update public.staff st
    set member_user_id = v_user_id
    where st.id = v_inv.staff_id
      and st.business_id = v_inv.business_id
      and st.member_user_id is null;

    if not found then
      raise exception using errcode = 'P0001', message = 'staff_already_linked';
    end if;
  elsif v_inv.role = 'staff' and v_display_name is not null then
    insert into public.staff (business_id, member_user_id, display_name)
    values (v_inv.business_id, v_user_id, v_display_name);
  end if;

  update public.business_invitations bi
  set accepted_at = now(),
      accepted_by = v_user_id
  where bi.id = v_inv.id;

  return query select v_inv.business_id, v_inv.role;
end;
$$;

revoke execute on function public.accept_business_invitation(text, text) from public, anon;
grant execute on function public.accept_business_invitation(text, text) to authenticated;
