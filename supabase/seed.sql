-- Demo data: a small UK store team with three weeks of attendance, shifts for the week ahead,
-- pay rates and some holidays. Safe to run once on an empty database (SQL editor or `supabase db reset`).

insert into public.employees (id, full_name, job_title, device_user_id, daily_minutes, color, email, started_on) values
  ('11111111-0000-0000-0000-000000000001', 'Amira Khan',     'Store supervisor', '1', 480, '#4f6d8f', 'amira@example.co.uk', '2024-03-01'),
  ('11111111-0000-0000-0000-000000000002', 'Tom Reed',       'Sales assistant',  '2', 300, '#5f8a6e', 'tom@example.co.uk',   '2025-01-15'),
  ('11111111-0000-0000-0000-000000000003', 'Priya Patel',    'Sales assistant',  '3', 240, '#b8873a', 'priya@example.co.uk', '2025-09-20'),
  ('11111111-0000-0000-0000-000000000004', 'Jack Wilson',    'Stock assistant',  '4', 360, '#b5583f', 'jack@example.co.uk',  '2025-06-02'),
  ('11111111-0000-0000-0000-000000000005', 'Chloe Davies',   'Sales assistant',  '5', 300, '#3f8a8c', 'chloe@example.co.uk', '2026-02-10'),
  ('11111111-0000-0000-0000-000000000006', 'Mohammed Hussain','Weekend assistant','6', 240, '#7a5c8e', null,                  '2026-05-01');

insert into public.pay_rates (employee_id, hourly_rate_pence, effective_from) values
  ('11111111-0000-0000-0000-000000000001', 1350, '2024-03-01'),
  ('11111111-0000-0000-0000-000000000001', 1425, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000002', 1271, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000003', 1271, '2025-09-20'),
  ('11111111-0000-0000-0000-000000000004', 1271, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000005', 1271, '2026-02-10'),
  ('11111111-0000-0000-0000-000000000006', 1085, '2026-05-01');

-- Past three weeks of attendance, plus today's morning so the dashboard looks alive.
-- Each person works on a fixed pattern of weekdays, starting around their usual time with a few minutes' jitter.
with pattern(employee_id, days, start_hour, minutes) as (
  values
    ('11111111-0000-0000-0000-000000000001'::uuid, array[1,2,3,4,5], 8, 480),
    ('11111111-0000-0000-0000-000000000002'::uuid, array[1,3,5,6],   9, 300),
    ('11111111-0000-0000-0000-000000000003'::uuid, array[2,4,6],     12, 240),
    ('11111111-0000-0000-0000-000000000004'::uuid, array[1,2,4,5],   7, 360),
    ('11111111-0000-0000-0000-000000000005'::uuid, array[2,3,5,6],   13, 300),
    ('11111111-0000-0000-0000-000000000006'::uuid, array[6,7],       10, 240)
),
days as (
  select d::date as day
  from generate_series(
    (now() at time zone 'Europe/London')::date - 21,
    (now() at time zone 'Europe/London')::date,
    interval '1 day'
  ) d
),
planned as (
  select
    p.employee_id,
    d.day,
    ((d.day + make_interval(hours => p.start_hour, mins => (random() * 14)::int - 4)) at time zone 'Europe/London') as clock_in,
    p.minutes + (random() * 30)::int - 8 as worked
  from pattern p
  join days d on extract(isodow from d.day)::int = any (p.days)
)
insert into public.attendance_sessions (employee_id, clock_in, clock_out)
select
  employee_id,
  clock_in,
  case
    when clock_in + make_interval(mins => worked) < now() then clock_in + make_interval(mins => worked, secs => (random() * 59)::int)
    else null  -- still at work
  end
from planned
where clock_in < now();

-- Shifts for the next 7 days following the same pattern.
with pattern(employee_id, days, start_hour, minutes) as (
  values
    ('11111111-0000-0000-0000-000000000001'::uuid, array[1,2,3,4,5], 8, 480),
    ('11111111-0000-0000-0000-000000000002'::uuid, array[1,3,5,6],   9, 300),
    ('11111111-0000-0000-0000-000000000003'::uuid, array[2,4,6],     12, 240),
    ('11111111-0000-0000-0000-000000000004'::uuid, array[1,2,4,5],   7, 360),
    ('11111111-0000-0000-0000-000000000005'::uuid, array[2,3,5,6],   13, 300),
    ('11111111-0000-0000-0000-000000000006'::uuid, array[6,7],       10, 240)
)
insert into public.shifts (employee_id, starts_at, ends_at)
select
  p.employee_id,
  (d::date + make_interval(hours => p.start_hour)) at time zone 'Europe/London',
  (d::date + make_interval(hours => p.start_hour, mins => p.minutes)) at time zone 'Europe/London'
from pattern p
join generate_series(
  (now() at time zone 'Europe/London')::date,
  (now() at time zone 'Europe/London')::date + 7,
  interval '1 day'
) d on extract(isodow from d)::int = any (p.days);

-- A manager override and some holidays.
insert into public.day_approvals (employee_id, work_date, approved_minutes, note)
values ('11111111-0000-0000-0000-000000000002', (now() at time zone 'Europe/London')::date - 2, 240, 'Left early, agreed 4h')
on conflict do nothing;

insert into public.leave_requests (employee_id, start_date, end_date, leave_type, status, note) values
  ('11111111-0000-0000-0000-000000000003', (now() at time zone 'Europe/London')::date + 10, (now() at time zone 'Europe/London')::date + 14, 'annual', 'approved', 'Family visit'),
  ('11111111-0000-0000-0000-000000000004', (now() at time zone 'Europe/London')::date + 3,  (now() at time zone 'Europe/London')::date + 3,  'annual', 'pending',  'Dentist'),
  ('11111111-0000-0000-0000-000000000005', (now() at time zone 'Europe/London')::date + 20, (now() at time zone 'Europe/London')::date + 24, 'annual', 'pending',  null),
  ('11111111-0000-0000-0000-000000000002', (now() at time zone 'Europe/London')::date - 12, (now() at time zone 'Europe/London')::date - 11, 'sick',   'approved', null);
