-- Demo data for showing Shiftly to Parkway Pharmacy: a community pharmacy team of eleven (plus one leaver) with
-- eight weeks of fingerprint scans, a rota for the fortnight ahead, pay rates, holidays and sign-in accounts.
-- The pharmacy opens 09:00–18:30 Monday to Friday and 09:00–17:30 on Saturday, and a pharmacist is rota'd for
-- every opening hour (Amira Monday to Thursday, Grace Friday and Saturday).
--
-- Everything is relative to the moment the seed runs, so reseed shortly before a demo (`npx supabase db reset`)
-- and run it during opening hours: some staff will be clocked in, some finished, one late and one on holiday.
-- Safe to run once on an empty database (SQL editor or `supabase db reset`).
--
-- Demo sign-ins (all share the password below; see README → Demo data):
--   sarah.mitchell@example.co.uk  manager  → dashboard
--   amira@example.co.uk, tom@example.co.uk, priya@example.co.uk, chloe@example.co.uk  employees → /me

select setseed(0.2026);  -- same "random" jitter every time

-- ---------------------------------------------------------------------------
-- The business (parkway.<root domain>) and its four branches. The team below works at Dagenham East.
-- TODO: the other three branch names are placeholders until Parkway confirms them.
-- ---------------------------------------------------------------------------

insert into public.businesses (id, slug, name, place_word, branch_word) values
  ('44444444-0000-0000-0000-000000000001', 'parkway', 'Parkway Pharmacy', 'pharmacy', 'branch');

insert into public.branches (id, business_id, name, opening_hours) values
  ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'Dagenham East', '{"1":["09:00","18:30"],"2":["09:00","18:30"],"3":["09:00","18:30"],"4":["09:00","18:30"],"5":["09:00","18:30"],"6":["09:00","17:30"]}'),
  ('33333333-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'Branch 2', '{"1":["09:00","18:30"],"2":["09:00","18:30"],"3":["09:00","18:30"],"4":["09:00","18:30"],"5":["09:00","18:30"],"6":["09:00","17:30"]}'),
  ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', 'Branch 3', '{"1":["09:00","18:30"],"2":["09:00","18:30"],"3":["09:00","18:30"],"4":["09:00","18:30"],"5":["09:00","18:30"],"6":["09:00","17:30"]}'),
  ('33333333-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000001', 'Branch 4', '{"1":["09:00","18:30"],"2":["09:00","18:30"],"3":["09:00","18:30"],"4":["09:00","18:30"],"5":["09:00","18:30"],"6":["09:00","17:30"]}');

-- ---------------------------------------------------------------------------
-- Sign-in accounts. app_metadata puts each one in the business with its role (handle_new_user).
-- ---------------------------------------------------------------------------

do $$
declare
  v_password constant text := 'shiftly-demo-2026';
  v_user record;
begin
  for v_user in
    select * from (values
      ('00000000-0000-0000-0000-00000000a001'::uuid, 'sarah.mitchell@example.co.uk', 'Sarah Mitchell', 'manager',  1),
      ('00000000-0000-0000-0000-00000000a002'::uuid, 'amira@example.co.uk',          'Amira Khan',     'employee', 2),
      ('00000000-0000-0000-0000-00000000a003'::uuid, 'tom@example.co.uk',            'Tom Reed',       'employee', 3),
      ('00000000-0000-0000-0000-00000000a004'::uuid, 'priya@example.co.uk',          'Priya Patel',    'employee', 4),
      ('00000000-0000-0000-0000-00000000a005'::uuid, 'chloe@example.co.uk',          'Chloe Davies',   'employee', 5)
    ) as u(id, email, full_name, role, ord)
    order by ord
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated', v_user.email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'business_id', '44444444-0000-0000-0000-000000000001', 'role', v_user.role),
      jsonb_build_object('full_name', v_user.full_name),
      now() - interval '60 days', now(),
      '', '', '', ''
    );

    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      v_user.id::text, v_user.id,
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      'email', now(), now() - interval '60 days', now()
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team and pay. Assistants follow the UK National Living Wage (£12.21 → £12.71 on 1 April 2026; 18–20: £10.00 → £10.85);
-- pharmacists, the trainee and the technician are paid above it.
-- ---------------------------------------------------------------------------

insert into public.employees (business_id, branch_id, id, user_id, full_name, job_title, device_user_id, daily_minutes, color, email, phone, active, started_on) values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a002', 'Amira Khan',       'Pharmacist',                   '1',  570, '#4f6d8f', 'amira@example.co.uk',  '07700 900101', true,  '2024-03-01'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a003', 'Tom Reed',         'Dispenser',                    '2',  480, '#5f8a6e', 'tom@example.co.uk',    '07700 900102', true,  '2025-01-15'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a004', 'Priya Patel',      'Trainee pharmacist',           '3',  480, '#b8873a', 'priya@example.co.uk',  '07700 900103', true,  '2025-09-20'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', null,                                   'Jack Wilson',      'Delivery driver',              '4',  360, '#b5583f', 'jack@example.co.uk',   '07700 900104', true,  '2025-06-02'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000a005', 'Chloe Davies',     'Medicines counter assistant',  '5',  300, '#3f8a8c', 'chloe@example.co.uk',  '07700 900105', true,  '2026-02-10'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000006', null,                                   'Mohammed Hussain', 'Saturday counter assistant',   '6',  240, '#7a5c8e', null,                   null,           true,  '2026-05-01'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000007', null,                                   'Grace O''Connor',  'Pharmacist',                   '7',  570, '#a8606f', 'grace@example.co.uk',  '07700 900107', true,  '2023-08-14'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000008', null,                                   'Daniel Okafor',    'Pharmacy technician',          '8',  480, '#6b7a3c', 'daniel@example.co.uk', '07700 900108', true,  '2025-11-03'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000009', null,                                   'Ellie Thompson',   'Dispensing assistant',         '9',  240, '#8a6a4f', 'ellie@example.co.uk',  '07700 900109', true,  '2026-01-05'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000010', null,                                   'Ryan Clarke',      'Counter assistant',            '10', 240, '#c07a3e', 'ryan@example.co.uk',   null,           true,  '2026-06-20'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000011', null,                                   'Sophie Bennett',   'Healthcare counter assistant', '11', 360, '#4f6d8f', 'sophie@example.co.uk', '07700 900111', true,  '2024-10-07'),
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000012', null,                                   'Liam Harris',      'Delivery driver',              '12', 240, '#5f8a6e', 'liam@example.co.uk',   null,           false, '2025-04-12');

insert into public.pay_rates (employee_id, hourly_rate_pence, effective_from) values
  ('11111111-0000-0000-0000-000000000010', 1085, '2026-06-20'),
  ('11111111-0000-0000-0000-000000000011', 1300, '2024-10-07'),
  ('11111111-0000-0000-0000-000000000011', 1325, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000012', 1221, '2025-04-12'),
  ('11111111-0000-0000-0000-000000000012', 1271, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000001', 2600, '2024-03-01'),
  ('11111111-0000-0000-0000-000000000001', 2700, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000002', 1300, '2025-04-01'),
  ('11111111-0000-0000-0000-000000000002', 1350, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000003', 1450, '2025-09-20'),
  ('11111111-0000-0000-0000-000000000003', 1500, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000004', 1221, '2025-06-02'),
  ('11111111-0000-0000-0000-000000000004', 1271, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000005', 1221, '2026-02-10'),
  ('11111111-0000-0000-0000-000000000005', 1271, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000006', 1085, '2026-05-01'),
  ('11111111-0000-0000-0000-000000000007', 2650, '2023-08-14'),
  ('11111111-0000-0000-0000-000000000007', 2750, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000008', 1450, '2025-11-03'),
  ('11111111-0000-0000-0000-000000000008', 1525, '2026-04-01'),
  ('11111111-0000-0000-0000-000000000009', 1250, '2026-01-05'),
  ('11111111-0000-0000-0000-000000000009', 1300, '2026-04-01');

-- ---------------------------------------------------------------------------
-- Fingerprint terminals: the pharmacy's own (enabled) and one that contacted the server but hasn't been approved.
-- ---------------------------------------------------------------------------

insert into public.devices (business_id, branch_id, id, serial_number, name, enabled, last_seen_at, last_ip, created_at) values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'CQZ7232460123', 'Dispensary terminal', true,  now() - interval '25 seconds', '81.2.69.142',   now() - interval '70 days'),
  ('44444444-0000-0000-0000-000000000001', null, '22222222-0000-0000-0000-000000000002', 'BOCK194960012', null,                  false, now() - interval '3 days',     '86.140.12.77', now() - interval '3 days');

-- ---------------------------------------------------------------------------
-- Usual weeks. weekday is ISO (1 = Monday); closed on Sundays. Grace has two rows because Saturday is shorter.
-- Liam left five weeks ago, so he has history but no pattern.
-- ---------------------------------------------------------------------------

create temp table seed_pattern (employee_id uuid, days int[], start_time time, minutes int, until_day int);
insert into seed_pattern values
  ('11111111-0000-0000-0000-000000000001', array[1,2,3,4],   '09:00', 570, null),  -- pharmacist, Mon–Thu
  ('11111111-0000-0000-0000-000000000002', array[1,3,5,6],   '09:00', 480, null),
  ('11111111-0000-0000-0000-000000000003', array[2,3,4,5,6], '09:00', 480, null),
  ('11111111-0000-0000-0000-000000000004', array[1,2,4,5],   '10:00', 360, null),  -- prescription deliveries
  ('11111111-0000-0000-0000-000000000005', array[2,3,5,6],   '13:00', 300, null),
  ('11111111-0000-0000-0000-000000000006', array[6],         '10:00', 240, null),
  ('11111111-0000-0000-0000-000000000007', array[5],         '09:00', 570, null),  -- pharmacist, Fri
  ('11111111-0000-0000-0000-000000000007', array[6],         '09:00', 510, null),  -- pharmacist, Sat (closes 17:30)
  ('11111111-0000-0000-0000-000000000008', array[1,3,4,6],   '08:30', 480, null),
  ('11111111-0000-0000-0000-000000000009', array[1,4,5],     '14:30', 240, null),
  ('11111111-0000-0000-0000-000000000010', array[5,6],       '13:30', 240, null),
  ('11111111-0000-0000-0000-000000000011', array[1,2,3],     '10:00', 360, null),
  ('11111111-0000-0000-0000-000000000012', array[2,4,6],     '12:00', 240, -35);

insert into public.shift_patterns (employee_id, branch_id, weekday, start_time, end_time)
select p.employee_id, '33333333-0000-0000-0000-000000000001', wd, p.start_time, p.start_time + make_interval(mins => p.minutes)
from seed_pattern p, unnest(p.days) as wd
where p.until_day is null;

-- ---------------------------------------------------------------------------
-- Holidays and sickness, decided by the manager. Approved leave takes people off the rota.
-- ---------------------------------------------------------------------------

create temp table seed_today as
select (now() at time zone 'Europe/London')::date as today;

insert into public.leave_requests (employee_id, start_date, end_date, leave_type, status, note, decided_by, decided_at, created_at)
select employee_id, t.today + s, t.today + e, kind::public.leave_type, status::public.leave_status, note,
  case when status in ('approved', 'declined') then '00000000-0000-0000-0000-00000000a001'::uuid end,
  case when status in ('approved', 'declined') then now() - make_interval(days => ask - 1) end,
  now() - make_interval(days => ask)
from seed_today t, (values
  ('11111111-0000-0000-0000-000000000011'::uuid, -1, 2,  'annual', 'approved',  'A few days in Cornwall',        21),
  ('11111111-0000-0000-0000-000000000003'::uuid, 10, 14, 'annual', 'approved',  'Family visit',                  18),
  ('11111111-0000-0000-0000-000000000004'::uuid, -26, -22, 'annual', 'approved', 'Half term with the kids',      45),
  ('11111111-0000-0000-0000-000000000002'::uuid, -12, -11, 'sick',   'approved', 'Flu',                          12),
  ('11111111-0000-0000-0000-000000000008'::uuid, -40, -40, 'other',  'approved', 'Jury service',                 50),
  ('11111111-0000-0000-0000-000000000004'::uuid, 3, 3,   'annual', 'pending',   'Dentist',                        2),
  ('11111111-0000-0000-0000-000000000005'::uuid, 20, 24, 'annual', 'pending',   'Friend''s wedding in Edinburgh', 1),
  ('11111111-0000-0000-0000-000000000010'::uuid, 30, 31, 'unpaid', 'pending',   'University open days',           0),
  ('11111111-0000-0000-0000-000000000007'::uuid, 5, 6,   'annual', 'declined',  'Weekend away; no locum free',    6),
  ('11111111-0000-0000-0000-000000000008'::uuid, 8, 9,   'annual', 'cancelled', null,                             9)
) as l(employee_id, s, e, kind, status, note, ask);

-- ---------------------------------------------------------------------------
-- Rota: eight weeks back and two weeks ahead, from the usual weeks, skipping approved leave.
-- Ellie is put on an extra shift that started 25 minutes ago and hasn't clocked in, so the dashboard shows
-- someone late (only when the seed runs during shop hours).
-- ---------------------------------------------------------------------------

create temp table seed_late as
select (now() at time zone 'Europe/London')::time between '08:30' and '17:30' as enabled;

insert into public.shifts (employee_id, branch_id, starts_at, ends_at)
select
  p.employee_id,
  '33333333-0000-0000-0000-000000000001',
  (d.day + p.start_time) at time zone 'Europe/London',
  (d.day + p.start_time) at time zone 'Europe/London' + make_interval(mins => p.minutes)
from seed_pattern p
cross join seed_today t
cross join seed_late l
join lateral (select g::date as day from generate_series(t.today - 56, t.today + 14, interval '1 day') g) d
  on extract(isodow from d.day)::int = any (p.days)
where (p.until_day is null or d.day <= t.today + p.until_day)
  and not (l.enabled and p.employee_id = '11111111-0000-0000-0000-000000000009' and d.day = t.today)
  and not exists (
    select 1 from public.leave_requests lr
    where lr.employee_id = p.employee_id and lr.status = 'approved' and d.day between lr.start_date and lr.end_date
  );

insert into public.shifts (employee_id, branch_id, starts_at, ends_at, note)
select '11111111-0000-0000-0000-000000000009', '33333333-0000-0000-0000-000000000001', s, s + interval '4 hours', 'Covering for Sophie'
from seed_late l, lateral (select date_bin('5 minutes', now() - interval '25 minutes', '2000-01-01') as s) x
where l.enabled;

-- ---------------------------------------------------------------------------
-- Scans. Each past shift becomes a clock in and clock out on the terminal with a few minutes' jitter;
-- now and then someone is late or doesn't turn up. Scans after "now" are dropped, so today's staff are mid-shift.
-- ---------------------------------------------------------------------------

create temp table seed_punches as
with s as materialized (
  select sh.employee_id, sh.shift_date, sh.starts_at, sh.ends_at,
         random() as r_in, random() as r_out, random() as r_late, random() as r_absent
  from public.shifts sh, seed_today t
  where sh.shift_date <= t.today and sh.note is null
)
select employee_id, shift_date, 'in' as kind, 'device'::public.punch_source as source,
  starts_at + case
    when r_late < 0.05 then make_interval(secs => (600 + r_in * 1200)::int)    -- 10–30 minutes late
    else make_interval(secs => ((r_in * 11 - 8) * 60)::int)                      -- 8 early to 3 late
  end as punched_at
from s where r_absent >= 0.02 or shift_date = (select today from seed_today)
union all
select employee_id, shift_date, 'out', 'device'::public.punch_source,
  ends_at + make_interval(secs => ((r_out * 18 - 4) * 60)::int)
from s where r_absent >= 0.02 or shift_date = (select today from seed_today);

delete from seed_punches where punched_at > now();

-- Missed clock out: Jack forgot to scan out on his last shift before the weekend; it's flagged on Attendance.
delete from seed_punches
where kind = 'out' and employee_id = '11111111-0000-0000-0000-000000000004'
  and shift_date = (select max(shift_date) from seed_punches, seed_today t
                    where employee_id = '11111111-0000-0000-0000-000000000004' and shift_date <= t.today - 2);

-- Chloe also forgot, a week ago; the manager fixed that one by hand below.
create temp table seed_fixed as
select employee_id, shift_date from seed_punches, seed_today t
where employee_id = '11111111-0000-0000-0000-000000000005' and shift_date <= t.today - 7
order by shift_date desc limit 1;
delete from seed_punches p using seed_fixed f
where p.kind = 'out' and p.employee_id = f.employee_id and p.shift_date = f.shift_date;

-- Grace's finger wasn't read yesterday morning, so the manager clocked her in from the dashboard.
update seed_punches set source = 'manual'
where kind = 'in' and employee_id = '11111111-0000-0000-0000-000000000007'
  and shift_date = (select max(shift_date) from seed_punches, seed_today t
                    where employee_id = '11111111-0000-0000-0000-000000000007' and shift_date < t.today);

-- A double scan (ignored as a duplicate) and a finger the terminal doesn't recognise.
insert into seed_punches (employee_id, shift_date, kind, source, punched_at)
select employee_id, shift_date, 'dup', 'device', punched_at + interval '22 seconds'
from seed_punches
where kind = 'in' and employee_id = '11111111-0000-0000-0000-000000000002'
order by shift_date desc limit 1;

-- Feed the scans through the real pairing triggers one at a time, oldest first, as the terminal would.
do $$
declare
  v_punch record;
begin
  for v_punch in
    select p.*, e.device_user_id from seed_punches p join public.employees e on e.id = p.employee_id
    order by p.punched_at
  loop
    if v_punch.source = 'manual' then
      insert into public.punches (employee_id, punched_at, source)
      values (v_punch.employee_id, v_punch.punched_at, 'manual');
    else
      insert into public.punches (business_id, device_id, device_user_id, punched_at, source, verify_mode, raw)
      values ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', v_punch.device_user_id, v_punch.punched_at, 'device', '1',
              v_punch.device_user_id || E'\t' || to_char(v_punch.punched_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI:SS') || E'\t0\t1\t0\t0\t0');
    end if;
  end loop;

  insert into public.punches (business_id, device_id, device_user_id, punched_at, source, verify_mode, raw)
  select '44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '15', p, 'device', '1',
         E'15\t' || to_char(p at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI:SS') || E'\t0\t1\t0\t0\t0'
  from (select ((select today from seed_today) - 1 + time '09:12:41') at time zone 'Europe/London' as p) x;
end;
$$;

-- The manager closes Chloe's forgotten session at the end of her shift (marked edited, written to the audit log).
update public.attendance_sessions a
set clock_out = sh.ends_at, note = 'Forgot to scan out; closed at end of shift'
from seed_fixed f
join public.shifts sh on sh.employee_id = f.employee_id and sh.shift_date = f.shift_date
where a.employee_id = f.employee_id and a.work_date = f.shift_date and a.clock_out is null;

-- ---------------------------------------------------------------------------
-- Manager overrides of paid time.
-- ---------------------------------------------------------------------------

insert into public.day_approvals (employee_id, work_date, approved_minutes, note, approved_by)
select employee_id, work_date, minutes, note, '00000000-0000-0000-0000-00000000a001'
from (
  select '11111111-0000-0000-0000-000000000002'::uuid as employee_id, 240 as minutes, 'Left early, agreed 4h' as note, 2 as back
  union all select '11111111-0000-0000-0000-000000000001', 600, 'Stayed late for the wholesaler delivery', 4
  union all select '11111111-0000-0000-0000-000000000008', 540, 'Extra hour for the controlled drugs check', 9
) o
cross join lateral (
  select max(work_date) as work_date from public.attendance_sessions a, seed_today t
  where a.employee_id = o.employee_id and a.clock_out is not null and a.work_date <= t.today - o.back
) d
where d.work_date is not null
on conflict do nothing;

drop table seed_pattern, seed_today, seed_late, seed_punches, seed_fixed;
