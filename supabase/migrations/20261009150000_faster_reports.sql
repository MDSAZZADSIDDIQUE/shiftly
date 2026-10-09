-- Reports stay fast as attendance builds up.
--
-- daily_summary joined its per-day aggregate back onto a list of days, so a page's date range only reached one
-- side and Postgres aggregated the whole attendance table every time (~100 ms with three years of data, even for
-- one day). It is now two branches, days with clock ins and days with only a manager override, so the date
-- filter reaches the attendance_date index in each. calendar_summary queried that view once per day in its range;
-- it now aggregates each table once (2 s -> a few ms for six weeks). Results are unchanged.

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
)
-- Days with clock ins (and the manager's override, if any).
select
  s.employee_id,
  s.work_date,
  e.full_name,
  e.color,
  s.sessions,
  s.worked_seconds,
  s.is_clocked_in,
  s.missed_clock_out,
  s.first_in,
  s.last_out,
  e.daily_minutes,
  a.approved_minutes,
  a.note as approval_note,
  coalesce(
    a.approved_minutes,
    case
      when e.daily_minutes is not null then least(e.daily_minutes, s.worked_seconds / 60)
      else s.worked_seconds / 60
    end
  )::int as paid_minutes
from s
join public.employees e on e.id = s.employee_id
left join public.day_approvals a on a.employee_id = s.employee_id and a.work_date = s.work_date
union all
-- Days the manager set hours for without any clock in.
select
  a.employee_id,
  a.work_date,
  e.full_name,
  e.color,
  0,
  0,
  false,
  false,
  null::timestamptz,
  null::timestamptz,
  e.daily_minutes,
  a.approved_minutes,
  a.note,
  a.approved_minutes
from public.day_approvals a
join public.employees e on e.id = a.employee_id
where not exists (
  select 1 from public.attendance_sessions x where x.employee_id = a.employee_id and x.work_date = a.work_date
);

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
  with days as (
    select g::date as day from generate_series(p_from, p_to, interval '1 day') as g
  ),
  worked as (
    select
      ds.work_date as day,
      count(distinct ds.employee_id) filter (where ds.worked_seconds > 0)::int as employees_worked,
      sum(ds.worked_seconds)::bigint as worked_seconds,
      sum(ds.paid_minutes)::bigint as paid_minutes
    from public.daily_summary ds
    where ds.work_date between p_from and p_to
    group by ds.work_date
  ),
  rota as (
    select
      s.shift_date as day,
      count(*)::int as shifts,
      sum(extract(epoch from s.ends_at - s.starts_at) / 60)::bigint as scheduled_minutes
    from public.shifts s
    where s.shift_date between p_from and p_to
    group by s.shift_date
  ),
  away as (
    select d.day, count(*)::int as on_leave
    from days d
    join public.leave_requests l on l.status = 'approved' and d.day between l.start_date and l.end_date
    group by d.day
  )
  select
    d.day,
    coalesce(w.employees_worked, 0),
    coalesce(w.worked_seconds, 0),
    coalesce(w.paid_minutes, 0),
    coalesce(r.shifts, 0),
    coalesce(r.scheduled_minutes, 0),
    coalesce(a.on_leave, 0)
  from days d
  left join worked w on w.day = d.day
  left join rota r on r.day = d.day
  left join away a on a.day = d.day
  order by d.day;
$$;

-- Manager overrides are looked up by day for the reports above.
create index day_approvals_date on public.day_approvals (work_date);
