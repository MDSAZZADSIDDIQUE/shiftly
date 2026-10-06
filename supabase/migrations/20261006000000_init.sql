-- Shiftly: clock in / clock out for a UK store.
-- All instants are stored as timestamptz (UTC). "Work dates" are calendar days in Europe/London.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('manager', 'employee');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'employee',
  created_at timestamptz not null default now()
);

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'manager'
  );
$$;

-- The first account created becomes the manager; later accounts are employees
-- (used by the employee app later). Promote others in the profiles table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when exists (select 1 from public.profiles where role = 'manager')
      then 'employee'::public.app_role
      else 'manager'::public.app_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Employees, pay rates, devices
-- ---------------------------------------------------------------------------

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  job_title text,
  -- The user ID / PIN this person is enrolled under on the fingerprint terminal.
  device_user_id text unique,
  -- Hours the manager sets for this employee's working day (e.g. 300 = 5h).
  -- Paid time for a day = manager's per-day override, else min(actual, this), else actual.
  daily_minutes integer check (daily_minutes is null or daily_minutes between 0 and 1440),
  color text not null default '#6366f1',
  active boolean not null default true,
  started_on date,
  created_at timestamptz not null default now()
);

create table public.pay_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  hourly_rate_pence integer not null check (hourly_rate_pence >= 0),
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  name text,
  -- Unknown terminals that contact the server are recorded but ignored until a manager enables them.
  enabled boolean not null default false,
  timezone text not null default 'Europe/London',
  last_seen_at timestamptz,
  last_ip text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Punches (immutable log) and attendance sessions (derived, editable)
-- ---------------------------------------------------------------------------

create type public.punch_source as enum ('device', 'manual');

create table public.punches (
  id bigint generated always as identity primary key,
  device_id uuid references public.devices (id) on delete set null,
  device_user_id text,
  employee_id uuid references public.employees (id) on delete cascade,
  punched_at timestamptz not null,
  source public.punch_source not null default 'device',
  verify_mode text,
  -- What happened to the punch: 'in', 'out', 'duplicate' or 'unknown_user'.
  outcome text,
  raw text,
  created_at timestamptz not null default now()
);

create unique index punches_device_dedupe
  on public.punches (device_id, device_user_id, punched_at)
  where device_id is not null;
create index punches_employee_time on public.punches (employee_id, punched_at desc);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  work_date date generated always as ((clock_in at time zone 'Europe/London')::date) stored,
  clock_in_punch_id bigint references public.punches (id) on delete set null,
  clock_out_punch_id bigint references public.punches (id) on delete set null,
  edited boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);

create index attendance_employee_date on public.attendance_sessions (employee_id, work_date);
create index attendance_date on public.attendance_sessions (work_date);
create index attendance_open on public.attendance_sessions (employee_id) where clock_out is null;

-- Manager's per-day override of paid time.
create table public.day_approvals (
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  approved_minutes integer not null check (approved_minutes between 0 and 1440),
  note text,
  approved_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);

-- ---------------------------------------------------------------------------
-- Shifts and leave
-- ---------------------------------------------------------------------------

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  shift_date date generated always as ((starts_at at time zone 'Europe/London')::date) stored,
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  exclude using gist (employee_id with =, tstzrange(starts_at, ends_at) with &&)
);

create index shifts_date on public.shifts (shift_date);

create type public.leave_type as enum ('annual', 'sick', 'unpaid', 'other');
create type public.leave_status as enum ('pending', 'approved', 'declined', 'cancelled');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  leave_type public.leave_type not null default 'annual',
  status public.leave_status not null default 'pending',
  note text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index leave_dates on public.leave_requests (start_date, end_date);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);

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

  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'employee_id' || ':' || coalesce(v_row ->> 'work_date', '')),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_attendance after update or delete on public.attendance_sessions
  for each row execute function public.audit_changes();
create trigger audit_day_approvals after insert or update or delete on public.day_approvals
  for each row execute function public.audit_changes();
create trigger audit_pay_rates after insert or update or delete on public.pay_rates
  for each row execute function public.audit_changes();
create trigger audit_leave after update or delete on public.leave_requests
  for each row execute function public.audit_changes();

-- Flag manual edits to sessions.
create or replace function public.mark_session_edited()
returns trigger
language plpgsql
as $$
begin
  if (new.clock_in, new.clock_out) is distinct from (old.clock_in, old.clock_out)
     and current_setting('shiftly.pairing', true) is distinct from 'on' then
    new.edited := true;
  end if;
  return new;
end;
$$;

create trigger attendance_mark_edited before update on public.attendance_sessions
  for each row execute function public.mark_session_edited();

-- ---------------------------------------------------------------------------
-- Punch pairing: every punch toggles the employee between "in" and "out".
-- ---------------------------------------------------------------------------

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
  if new.employee_id is null and new.device_user_id is not null then
    select id into new.employee_id from public.employees where device_user_id = new.device_user_id;
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
    insert into public.attendance_sessions (employee_id, clock_in, clock_in_punch_id)
    values (new.employee_id, new.punched_at, new.id);
  end if;
  perform set_config('shiftly.pairing', 'off', true);
  return null;
end;
$$;

create trigger punches_pair before insert on public.punches
  for each row execute function public.pair_punch();
create trigger punches_apply after insert on public.punches
  for each row execute function public.apply_punch();

-- Called by the device endpoint (service role only).
-- p_rows: [{"user_id": "12", "time": "2026-10-06 09:01:33", "verify": "1", "raw": "..."}]
-- Times are the terminal's local wall-clock time, converted using the device's timezone.
create or replace function public.ingest_device_punches(p_serial text, p_ip text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_row jsonb;
  v_count integer := 0;
begin
  insert into public.devices (serial_number, last_seen_at, last_ip)
  values (p_serial, now(), p_ip)
  on conflict (serial_number) do update set last_seen_at = now(), last_ip = excluded.last_ip
  returning * into v_device;

  if not v_device.enabled then
    return 0;
  end if;

  for v_row in
    select value from jsonb_array_elements(p_rows)
    order by (value ->> 'time')
  loop
    insert into public.punches (device_id, device_user_id, punched_at, source, verify_mode, raw)
    values (
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

create or replace function public.touch_device(p_serial text, p_ip text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.devices (serial_number, last_seen_at, last_ip)
  values (p_serial, now(), p_ip)
  on conflict (serial_number) do update set last_seen_at = now(), last_ip = excluded.last_ip
  returning enabled;
$$;

revoke all on function public.ingest_device_punches(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.touch_device(text, text) from public, anon, authenticated;
grant execute on function public.ingest_device_punches(text, text, jsonb) to service_role;
grant execute on function public.touch_device(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

-- One row per employee per work day that has sessions or a manager override.
-- Open sessions count up to now; sessions open > 16h are "missed clock out" and count as 0.
create or replace view public.daily_summary
with (security_invoker = on)
as
with s as (
  select
    employee_id,
    work_date,
    count(*)::int as sessions,
    sum(
      case
        when clock_out is not null then extract(epoch from clock_out - clock_in)
        when now() - clock_in <= interval '16 hours' then extract(epoch from now() - clock_in)
        else 0
      end
    )::int as worked_seconds,
    bool_or(clock_out is null and now() - clock_in <= interval '16 hours') as is_clocked_in,
    bool_or(clock_out is null and now() - clock_in > interval '16 hours') as missed_clock_out,
    min(clock_in) as first_in,
    max(clock_out) as last_out
  from public.attendance_sessions
  group by employee_id, work_date
),
k as (
  select employee_id, work_date from s
  union
  select employee_id, work_date from public.day_approvals
)
select
  k.employee_id,
  k.work_date,
  e.full_name,
  e.color,
  coalesce(s.sessions, 0) as sessions,
  coalesce(s.worked_seconds, 0) as worked_seconds,
  coalesce(s.is_clocked_in, false) as is_clocked_in,
  coalesce(s.missed_clock_out, false) as missed_clock_out,
  s.first_in,
  s.last_out,
  e.daily_minutes,
  a.approved_minutes,
  a.note as approval_note,
  coalesce(
    a.approved_minutes,
    case
      when e.daily_minutes is not null then least(e.daily_minutes, coalesce(s.worked_seconds, 0) / 60)
      else coalesce(s.worked_seconds, 0) / 60
    end
  )::int as paid_minutes
from k
join public.employees e on e.id = k.employee_id
left join s on s.employee_id = k.employee_id and s.work_date = k.work_date
left join public.day_approvals a on a.employee_id = k.employee_id and a.work_date = k.work_date;

-- Gross wages for a date range, using the pay rate in effect on each day.
create or replace function public.wage_report(p_from date, p_to date)
returns table (
  employee_id uuid,
  full_name text,
  color text,
  days_worked integer,
  worked_seconds bigint,
  paid_minutes bigint,
  gross_pence bigint,
  days_without_rate integer,
  current_rate_pence integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with d as (
    select ds.*, r.hourly_rate_pence
    from public.daily_summary ds
    left join lateral (
      select pr.hourly_rate_pence from public.pay_rates pr
      where pr.employee_id = ds.employee_id and pr.effective_from <= ds.work_date
      order by pr.effective_from desc limit 1
    ) r on true
    where ds.work_date between p_from and p_to
  )
  select
    e.id,
    e.full_name,
    e.color,
    count(d.work_date) filter (where d.paid_minutes > 0)::int,
    coalesce(sum(d.worked_seconds), 0)::bigint,
    coalesce(sum(d.paid_minutes), 0)::bigint,
    coalesce(sum(round(d.paid_minutes * d.hourly_rate_pence / 60.0)), 0)::bigint,
    (count(d.work_date) filter (where d.hourly_rate_pence is null and d.paid_minutes > 0))::int,
    (select pr.hourly_rate_pence from public.pay_rates pr
      where pr.employee_id = e.id and pr.effective_from <= p_to
      order by pr.effective_from desc limit 1)
  from public.employees e
  left join d on d.employee_id = e.id
  where e.active or d.employee_id is not null
  group by e.id, e.full_name, e.color
  order by e.full_name;
$$;

-- Per-day totals for the calendar.
create or replace function public.calendar_summary(p_from date, p_to date)
returns table (
  day date,
  employees_worked integer,
  worked_seconds bigint,
  paid_minutes bigint,
  shifts integer,
  scheduled_minutes bigint,
  on_leave integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    g.day::date,
    (select count(distinct ds.employee_id) from public.daily_summary ds
      where ds.work_date = g.day and ds.worked_seconds > 0)::int,
    (select coalesce(sum(ds.worked_seconds), 0) from public.daily_summary ds where ds.work_date = g.day)::bigint,
    (select coalesce(sum(ds.paid_minutes), 0) from public.daily_summary ds where ds.work_date = g.day)::bigint,
    (select count(*) from public.shifts s where s.shift_date = g.day)::int,
    (select coalesce(sum(extract(epoch from s.ends_at - s.starts_at) / 60), 0)
      from public.shifts s where s.shift_date = g.day)::bigint,
    (select count(*) from public.leave_requests l
      where l.status = 'approved' and g.day between l.start_date and l.end_date)::int
  from generate_series(p_from, p_to, interval '1 day') as g(day);
$$;

-- ---------------------------------------------------------------------------
-- Row level security: managers can do everything; employees read their own data.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.pay_rates enable row level security;
alter table public.devices enable row level security;
alter table public.punches enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.day_approvals enable row level security;
alter table public.shifts enable row level security;
alter table public.leave_requests enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles: read own or manager" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_manager()));
create policy "profiles: manager update" on public.profiles
  for update to authenticated using ((select public.is_manager()));

create policy "employees: manager all" on public.employees
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "employees: read self" on public.employees
  for select to authenticated using (user_id = (select auth.uid()));

create policy "pay_rates: manager all" on public.pay_rates
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

create policy "devices: manager all" on public.devices
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

create policy "punches: manager read" on public.punches
  for select to authenticated using ((select public.is_manager()));
create policy "punches: manager manual insert" on public.punches
  for insert to authenticated with check ((select public.is_manager()) and source = 'manual');

create policy "attendance: manager all" on public.attendance_sessions
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "attendance: read own" on public.attendance_sessions
  for select to authenticated using (
    employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );

create policy "day_approvals: manager all" on public.day_approvals
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "day_approvals: read own" on public.day_approvals
  for select to authenticated using (
    employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );

create policy "shifts: manager all" on public.shifts
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "shifts: read own" on public.shifts
  for select to authenticated using (
    employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );

create policy "leave: manager all" on public.leave_requests
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "leave: read own" on public.leave_requests
  for select to authenticated using (
    employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );
create policy "leave: request own" on public.leave_requests
  for insert to authenticated with check (
    status = 'pending'
    and employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );

create policy "audit: manager read" on public.audit_log
  for select to authenticated using ((select public.is_manager()));

-- Live dashboard updates.
alter publication supabase_realtime add table public.attendance_sessions;
alter publication supabase_realtime add table public.punches;
