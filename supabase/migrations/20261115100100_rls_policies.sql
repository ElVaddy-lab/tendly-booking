-- Row Level Security for Tendly.
-- Helpers live in the non-exposed `private` schema, run as security definer with an empty search_path,
-- and return sets so policies can wrap them in (select …) and Postgres evaluates them once per statement.

grant usage on schema private to anon, authenticated;
revoke execute on all functions in schema private from public;
grant execute on function private.is_valid_timezone(text) to anon, authenticated;

create function private.business_ids_with_role(min_role public.member_role)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
  from public.business_members m
  where m.user_id = (select auth.uid())
    and m.role >= min_role;
$$;

create function private.own_staff_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  where s.member_user_id = (select auth.uid());
$$;

revoke execute on function private.business_ids_with_role(public.member_role) from public;
revoke execute on function private.own_staff_ids() from public;
grant execute on function private.business_ids_with_role(public.member_role) to authenticated;
grant execute on function private.own_staff_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges: start from nothing, grant only what policies may allow.
-- ---------------------------------------------------------------------------
revoke all on
  public.businesses, public.business_members, public.staff, public.services, public.staff_services,
  public.weekly_hours, public.time_off, public.bookings
from anon, authenticated;

grant select on public.businesses, public.staff, public.services, public.staff_services to anon;

grant select, update on public.businesses to authenticated;
grant select, insert, update, delete on
  public.business_members, public.staff, public.services, public.staff_services,
  public.weekly_hours, public.time_off
to authenticated;
grant select, insert, update on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- businesses: public profile; only the owner changes settings.
-- Creation goes through an onboarding RPC (stage 5), not a direct insert.
-- ---------------------------------------------------------------------------
create policy "Business profiles are public"
  on public.businesses for select
  to anon, authenticated
  using (true);

create policy "Owners update their business"
  on public.businesses for update
  to authenticated
  using (id in (select private.business_ids_with_role('owner')))
  with check (id in (select private.business_ids_with_role('owner')));

-- ---------------------------------------------------------------------------
-- business_members: visible to members; managed by owners.
-- ---------------------------------------------------------------------------
create policy "Members see their business team"
  on public.business_members for select
  to authenticated
  using (business_id in (select private.business_ids_with_role('staff')));

create policy "Owners add members"
  on public.business_members for insert
  to authenticated
  with check (business_id in (select private.business_ids_with_role('owner')));

create policy "Owners change members"
  on public.business_members for update
  to authenticated
  using (business_id in (select private.business_ids_with_role('owner')))
  with check (business_id in (select private.business_ids_with_role('owner')));

create policy "Owners remove members"
  on public.business_members for delete
  to authenticated
  using (business_id in (select private.business_ids_with_role('owner')));

-- ---------------------------------------------------------------------------
-- staff and services: active ones are public; members also see inactive; managers edit.
-- ---------------------------------------------------------------------------
create policy "Active staff are public"
  on public.staff for select
  to anon
  using (is_active);

create policy "Members see all staff of their business"
  on public.staff for select
  to authenticated
  using (is_active or business_id in (select private.business_ids_with_role('staff')));

create policy "Managers add staff"
  on public.staff for insert
  to authenticated
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers edit staff"
  on public.staff for update
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')))
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers remove staff"
  on public.staff for delete
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')));

create policy "Active services are public"
  on public.services for select
  to anon
  using (is_active);

create policy "Members see all services of their business"
  on public.services for select
  to authenticated
  using (is_active or business_id in (select private.business_ids_with_role('staff')));

create policy "Managers add services"
  on public.services for insert
  to authenticated
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers edit services"
  on public.services for update
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')))
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers remove services"
  on public.services for delete
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')));

create policy "Who offers what is public"
  on public.staff_services for select
  to anon, authenticated
  using (true);

create policy "Managers assign services"
  on public.staff_services for insert
  to authenticated
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers unassign services"
  on public.staff_services for delete
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')));

-- ---------------------------------------------------------------------------
-- weekly_hours: members read; managers write. The public sees slots, not raw schedules.
-- ---------------------------------------------------------------------------
create policy "Members see working hours"
  on public.weekly_hours for select
  to authenticated
  using (business_id in (select private.business_ids_with_role('staff')));

create policy "Managers add working hours"
  on public.weekly_hours for insert
  to authenticated
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers edit working hours"
  on public.weekly_hours for update
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')))
  with check (business_id in (select private.business_ids_with_role('manager')));

create policy "Managers remove working hours"
  on public.weekly_hours for delete
  to authenticated
  using (business_id in (select private.business_ids_with_role('manager')));

-- ---------------------------------------------------------------------------
-- time_off: members read; managers write any, staff write their own.
-- ---------------------------------------------------------------------------
create policy "Members see time off"
  on public.time_off for select
  to authenticated
  using (business_id in (select private.business_ids_with_role('staff')));

create policy "Managers or the staff member add time off"
  on public.time_off for insert
  to authenticated
  with check (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );

create policy "Managers or the staff member edit time off"
  on public.time_off for update
  to authenticated
  using (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  )
  with check (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );

create policy "Managers or the staff member remove time off"
  on public.time_off for delete
  to authenticated
  using (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );

-- ---------------------------------------------------------------------------
-- bookings: customer data. Managers see and edit all of their business; staff only their own.
-- No delete: bookings are cancelled; customer data erasure goes through an RPC (stage 9).
-- Public booking goes through create_booking() (security definer), never a direct insert.
-- ---------------------------------------------------------------------------
create policy "Managers see all bookings, staff their own"
  on public.bookings for select
  to authenticated
  using (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );

create policy "Managers book anyone, staff book themselves"
  on public.bookings for insert
  to authenticated
  with check (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );

create policy "Managers edit all bookings, staff their own"
  on public.bookings for update
  to authenticated
  using (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  )
  with check (
    business_id in (select private.business_ids_with_role('manager'))
    or staff_id in (select private.own_staff_ids())
  );
