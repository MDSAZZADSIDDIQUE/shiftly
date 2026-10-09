-- Several businesses on one Shiftly. Each is reached on its own subdomain (parkway.shiftly.softilo.co.uk), has its
-- own name, logo, wording and branches, and every row belongs to exactly one business. Row level security keeps
-- businesses apart; composite foreign keys stop a row pointing at another business's employee or branch.
-- Businesses and branches are created and themed by the platform admin (service role); managers only read them.

-- Backfilling business_id below must not write an "update" audit entry for every existing row.
select set_config('shiftly.pairing', 'on', false);

-- ---------------------------------------------------------------------------
-- Businesses and branches
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  -- The subdomain: parkway -> parkway.<root domain>.
  slug text not null unique
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' and slug not in ('www', 'admin', 'api', 'mail')),
  name text not null check (length(trim(name)) > 0),
  -- What staff call the premises ("shop", "pharmacy", "café") and each location ("branch", "store", "site").
  place_word text not null default 'shop' check (length(trim(place_word)) > 0),
  branch_word text not null default 'branch' check (length(trim(branch_word)) > 0),
  logo bytea,
  logo_type text check (logo_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  logo_updated_at timestamptz,
  created_at timestamptz not null default now(),
  check ((logo is null) = (logo_type is null)),
  check (logo is null or octet_length(logo) <= 512 * 1024)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- ISO weekday (1 = Monday) -> ["09:00", "18:30"] in UK time. A day that is missing is closed.
  opening_hours jsonb not null default
    '{"1":["09:00","17:30"],"2":["09:00","17:30"],"3":["09:00","17:30"],"4":["09:00","17:30"],"5":["09:00","17:30"],"6":["09:00","17:30"]}',
  created_at timestamptz not null default now(),
  unique (business_id, name),
  -- Target of the composite foreign keys below.
  unique (id, business_id),
  check (jsonb_typeof(opening_hours) = 'object')
);

-- Existing data (a single-shop install) becomes one business with one branch, renamed later by the platform admin.
insert into public.businesses (slug, name)
select 'demo', 'My business'
where exists (select 1 from public.profiles) or exists (select 1 from public.employees) or exists (select 1 from public.devices);

insert into public.branches (business_id, name)
select id, 'Main branch' from public.businesses;

-- ---------------------------------------------------------------------------
-- Profiles: which business someone belongs to, and the platform admin flag
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column business_id uuid references public.businesses (id) on delete cascade,
  add column is_platform_admin boolean not null default false;

update public.profiles set business_id = (select id from public.businesses limit 1);

create index profiles_business on public.profiles (business_id);

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select business_id from public.profiles where id = auth.uid();
$$;

-- New accounts are created by the platform admin (or the seed) with app_metadata
-- {"business_id": "...", "role": "manager" | "employee"}. app_metadata can only be set with the service role,
-- unlike user_metadata, so it is safe to trust. An account without a business can't see any business's data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := nullif(new.raw_app_meta_data ->> 'business_id', '')::uuid;
begin
  insert into public.profiles (id, full_name, role, business_id, is_platform_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when new.raw_app_meta_data ->> 'role' = 'manager' then 'manager' else 'employee' end::public.app_role,
    v_business,
    coalesce((new.raw_app_meta_data ->> 'platform_admin')::boolean, false)
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- business_id on every table
-- ---------------------------------------------------------------------------

alter table public.employees
  add column business_id uuid references public.businesses (id) on delete cascade default public.current_business_id(),
  add column branch_id uuid;
update public.employees set business_id = (select id from public.businesses limit 1);
alter table public.employees alter column business_id set not null;
alter table public.employees add constraint employees_id_business_key unique (id, business_id);
alter table public.employees
  add constraint employees_branch_fkey foreign key (branch_id, business_id)
  references public.branches (id, business_id) on delete set null (branch_id);
-- A fingerprint ID is unique within a business, so one person keeps their ID at every branch.
-- (Same constraint name as before: the app maps it to a friendly message.)
alter table public.employees drop constraint employees_device_user_id_key;
alter table public.employees add constraint employees_device_user_id_key unique (business_id, device_user_id);
create index employees_business on public.employees (business_id);

alter table public.devices
  add column business_id uuid references public.businesses (id) on delete cascade default public.current_business_id(),
  add column branch_id uuid;
update public.devices set business_id = (select id from public.businesses limit 1);
alter table public.devices
  add constraint devices_branch_fkey foreign key (branch_id, business_id)
  references public.branches (id, business_id) on delete set null (branch_id),
  -- Unclaimed terminals (business unknown) wait for the platform admin and can't record scans.
  add constraint devices_branch_needs_business check (branch_id is null or business_id is not null),
  add constraint devices_enabled_needs_business check (not enabled or business_id is not null);
create index devices_business on public.devices (business_id);

-- Tables whose rows belong to an employee: business_id is copied from the employee by a trigger, and the
-- composite key makes the pair impossible to get wrong.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'pay_rates', 'punches', 'attendance_sessions', 'day_approvals', 'shifts', 'leave_requests', 'shift_patterns'
  ]
  loop
    execute format('alter table public.%I add column business_id uuid references public.businesses (id) on delete cascade', v_table);
    execute format('update public.%I set business_id = (select id from public.businesses limit 1)', v_table);
    execute format('alter table public.%I alter column business_id set not null', v_table);
    execute format(
      'alter table public.%I add constraint %I foreign key (employee_id, business_id) references public.employees (id, business_id) on delete cascade',
      v_table, v_table || '_employee_business_fkey'
    );
    execute format('create index %I on public.%I (business_id)', v_table || '_business', v_table);
  end loop;
end;
$$;

-- Where a shift, usual-week slot, terminal or clock in happened.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['shifts', 'shift_patterns', 'attendance_sessions']
  loop
    execute format('alter table public.%I add column branch_id uuid', v_table);
    execute format(
      'alter table public.%I add constraint %I foreign key (branch_id, business_id) references public.branches (id, business_id) on delete set null (branch_id)',
      v_table, v_table || '_branch_fkey'
    );
  end loop;
end;
$$;

-- Existing single-shop data happened at the one branch.
update public.employees set branch_id = (select id from public.branches limit 1);
update public.devices set branch_id = (select id from public.branches limit 1);
update public.shifts set branch_id = (select id from public.branches limit 1);
update public.shift_patterns set branch_id = (select id from public.branches limit 1);
update public.attendance_sessions set branch_id = (select id from public.branches limit 1);

alter table public.audit_log add column business_id uuid references public.businesses (id) on delete cascade;
update public.audit_log set business_id = (select id from public.businesses limit 1);
create index audit_log_business on public.audit_log (business_id, created_at desc);

create or replace function public.set_business_from_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.employee_id is not null then
    select business_id into new.business_id from public.employees where id = new.employee_id;
  end if;
  return new;
end;
$$;

-- Named to sort before the other before-insert triggers (punches_pair needs business_id).
create trigger pay_rates_business before insert or update of employee_id on public.pay_rates
  for each row execute function public.set_business_from_employee();
create trigger punches_business before insert on public.punches
  for each row execute function public.set_business_from_employee();
create trigger attendance_business before insert or update of employee_id on public.attendance_sessions
  for each row execute function public.set_business_from_employee();
create trigger day_approvals_business before insert or update of employee_id on public.day_approvals
  for each row execute function public.set_business_from_employee();
create trigger shifts_business before insert or update of employee_id on public.shifts
  for each row execute function public.set_business_from_employee();
create trigger leave_business before insert or update of employee_id on public.leave_requests
  for each row execute function public.set_business_from_employee();
create trigger shift_patterns_business before insert or update of employee_id on public.shift_patterns
  for each row execute function public.set_business_from_employee();

-- An employee record can only be linked to a sign-in account of the same business.
create or replace function public.check_employee_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.profiles where id = new.user_id and business_id = new.business_id
  ) then
    raise exception 'That account belongs to a different business' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger employees_account before insert or update of user_id, business_id on public.employees
  for each row execute function public.check_employee_account();

-- ---------------------------------------------------------------------------
-- Audit log, punch pairing and the terminal endpoint, now business-aware
-- ---------------------------------------------------------------------------

create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  -- Automatic clock-out pairing is not a manual change.
  if current_setting('shiftly.pairing', true) = 'on' then
    return coalesce(new, old);
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, business_id)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'employee_id' || ':' || coalesce(v_row ->> 'work_date', '')),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    (v_row ->> 'business_id')::uuid
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.pair_punch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.attendance_sessions;
  v_last_out timestamptz;
begin
  -- Fingerprint IDs are only unique within a business.
  if new.employee_id is null and new.device_user_id is not null then
    select id into new.employee_id from public.employees
    where business_id = new.business_id and device_user_id = new.device_user_id;
  end if;

  if new.employee_id is null then
    new.outcome := 'unknown_user';
    return new;
  end if;

  -- Ignore accidental double scans within 60 seconds of the last clock in / out.
  select max(greatest(clock_in, coalesce(clock_out, clock_in))) into v_last_out
  from public.attendance_sessions
  where employee_id = new.employee_id
    and clock_in <= new.punched_at;

  if v_last_out is not null and new.punched_at - v_last_out < interval '60 seconds' then
    new.outcome := 'duplicate';
    return new;
  end if;

  select * into v_open
  from public.attendance_sessions
  where employee_id = new.employee_id
    and clock_out is null
    and clock_in <= new.punched_at
  order by clock_in desc
  limit 1;

  -- A session left open for more than 16 hours is a missed clock out; start a new one.
  if found and new.punched_at - v_open.clock_in <= interval '16 hours' then
    new.outcome := 'out';
  else
    new.outcome := 'in';
  end if;
  return new;
end;
$$;

create or replace function public.apply_punch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('shiftly.pairing', 'on', true);
  if new.outcome = 'out' then
    update public.attendance_sessions
    set clock_out = new.punched_at, clock_out_punch_id = new.id
    where id = (
      select id from public.attendance_sessions
      where employee_id = new.employee_id and clock_out is null and clock_in <= new.punched_at
      order by clock_in desc limit 1
    );
  elsif new.outcome = 'in' then
    -- The branch is the terminal's; a manual clock in has none.
    insert into public.attendance_sessions (employee_id, clock_in, clock_in_punch_id, branch_id)
    values (
      new.employee_id, new.punched_at, new.id,
      (select branch_id from public.devices where id = new.device_id)
    );
  end if;
  perform set_config('shiftly.pairing', 'off', true);
  return null;
end;
$$;

drop function public.ingest_device_punches(text, text, jsonb);
drop function public.touch_device(text, text);

-- A terminal that isn't known yet is recorded under the business whose subdomain it called (p_business_slug),
-- or under no business if it called the bare domain. A known terminal never changes business this way, except
-- that an unclaimed one is claimed by the first business subdomain it calls.
create or replace function public.touch_device(p_serial text, p_ip text, p_business_slug text default null)
returns public.devices
language sql
security definer
set search_path = ''
as $$
  insert into public.devices (serial_number, last_seen_at, last_ip, business_id)
  values (p_serial, now(), p_ip, (select id from public.businesses where slug = p_business_slug))
  on conflict (serial_number) do update set
    last_seen_at = now(),
    last_ip = excluded.last_ip,
    business_id = coalesce(public.devices.business_id, excluded.business_id)
  returning *;
$$;

-- p_rows: [{"user_id": "12", "time": "2026-10-06 09:01:33", "verify": "1", "raw": "..."}]
-- Times are the terminal's local wall-clock time, converted using the device's timezone.
create or replace function public.ingest_device_punches(p_serial text, p_ip text, p_rows jsonb, p_business_slug text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices := public.touch_device(p_serial, p_ip, p_business_slug);
  v_row jsonb;
  v_count integer := 0;
begin
  if not v_device.enabled then
    return 0;
  end if;

  for v_row in
    select value from jsonb_array_elements(p_rows)
    order by (value ->> 'time')
  loop
    insert into public.punches (business_id, device_id, device_user_id, punched_at, source, verify_mode, raw)
    values (
      v_device.business_id,
      v_device.id,
      v_row ->> 'user_id',
      ((v_row ->> 'time')::timestamp at time zone v_device.timezone),
      'device',
      v_row ->> 'verify',
      v_row ->> 'raw'
    )
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.ingest_device_punches(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.touch_device(text, text, text) from public, anon, authenticated;
grant execute on function public.ingest_device_punches(text, text, jsonb, text) to service_role;
grant execute on function public.touch_device(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security: managers manage their own business; employees read their own data (unchanged).
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.branches enable row level security;

create policy "businesses: read own" on public.businesses
  for select to authenticated using (id = (select public.current_business_id()));
create policy "branches: read own business" on public.branches
  for select to authenticated using (business_id = (select public.current_business_id()));

drop policy "profiles: read own or manager" on public.profiles;
drop policy "profiles: manager update" on public.profiles;
create policy "profiles: read own or manager" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or (business_id = (select public.current_business_id()) and (select public.is_manager()))
  );
create policy "profiles: manager update" on public.profiles
  for update to authenticated
  using (business_id = (select public.current_business_id()) and (select public.is_manager()))
  with check (business_id = (select public.current_business_id()));
-- Managers may rename people or change their role, never their business or the platform admin flag.
revoke update on public.profiles from authenticated;
grant update (full_name, role) on public.profiles to authenticated;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select * from (values
      ('employees',           'employees: manager all'),
      ('pay_rates',           'pay_rates: manager all'),
      ('devices',             'devices: manager all'),
      ('attendance_sessions', 'attendance: manager all'),
      ('day_approvals',       'day_approvals: manager all'),
      ('shifts',              'shifts: manager all'),
      ('leave_requests',      'leave: manager all'),
      ('shift_patterns',      'shift_patterns: manager all')
    ) as p(table_name, policy_name)
  loop
    execute format('drop policy %I on public.%I', v_policy.policy_name, v_policy.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (business_id = (select public.current_business_id()) and (select public.is_manager()))
         with check (business_id = (select public.current_business_id()) and (select public.is_manager()))',
      v_policy.policy_name, v_policy.table_name
    );
  end loop;
end;
$$;

drop policy "punches: manager read" on public.punches;
drop policy "punches: manager manual insert" on public.punches;
create policy "punches: manager read" on public.punches
  for select to authenticated
  using (business_id = (select public.current_business_id()) and (select public.is_manager()));
create policy "punches: manager manual insert" on public.punches
  for insert to authenticated
  with check (business_id = (select public.current_business_id()) and (select public.is_manager()) and source = 'manual');

drop policy "audit: manager read" on public.audit_log;
create policy "audit: manager read" on public.audit_log
  for select to authenticated
  using (business_id = (select public.current_business_id()) and (select public.is_manager()));

select set_config('shiftly.pairing', 'off', false);
