-- Businesses must never see or change each other's data. Runs against the seed (Parkway Pharmacy) plus a second
-- business created here, inside a transaction that is rolled back. Run with: npx supabase test db
begin;
select plan(27);

-- A second business with a manager, and an employee who has the same fingerprint ID ("1") as Amira at Parkway.
insert into public.businesses (id, slug, name) values ('55555555-0000-0000-0000-000000000001', 'other', 'Other Café');
insert into public.branches (id, business_id, name)
values ('55555555-0000-0000-0000-0000000000b1', '55555555-0000-0000-0000-000000000001', 'High Street');
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '55555555-0000-0000-0000-00000000a001', 'authenticated', 'authenticated',
        'owner@other.example', '{"business_id": "55555555-0000-0000-0000-000000000001", "role": "manager"}',
        '{"full_name": "Olive Owner"}', now(), now());
insert into public.employees (id, business_id, branch_id, full_name, device_user_id)
values ('55555555-0000-0000-0000-0000000000e1', '55555555-0000-0000-0000-000000000001',
        '55555555-0000-0000-0000-0000000000b1', 'Oscar Other', '1');
insert into public.shifts (employee_id, starts_at, ends_at)
values ('55555555-0000-0000-0000-0000000000e1', now() + interval '1 day', now() + interval '1 day 4 hours');

select is(
  (select business_id from public.shifts where employee_id = '55555555-0000-0000-0000-0000000000e1'),
  '55555555-0000-0000-0000-000000000001'::uuid,
  'a shift takes its business from the employee'
);
select is(
  (select role::text from public.profiles where id = '55555555-0000-0000-0000-00000000a001'),
  'manager', 'app_metadata sets the role of a new account'
);

-- ---------------------------------------------------------------------------
-- Parkway's manager
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}', true);

select is((select count(*)::int from public.businesses), 1, 'a manager sees only their own business');
select is((select count(*)::int from public.branches), 4, 'a manager sees only their own branches');
select is((select count(*)::int from public.employees), 12, 'a manager sees only their own staff');
select is((select count(*)::int from public.employees where business_id <> '44444444-0000-0000-0000-000000000001'), 0, 'no other business''s staff');
select is((select count(*)::int from public.shifts where business_id <> '44444444-0000-0000-0000-000000000001'), 0, 'no other business''s shifts');
select is((select count(*)::int from public.profiles where business_id <> '44444444-0000-0000-0000-000000000001'), 0, 'no other business''s accounts');
select is((select count(*)::int from public.daily_summary ds join public.employees e on e.id = ds.employee_id), (select count(*)::int from public.daily_summary), 'daily summary only covers own staff');

select throws_ok(
  $$ insert into public.shifts (employee_id, starts_at, ends_at)
     values ('55555555-0000-0000-0000-0000000000e1', now() + interval '2 days', now() + interval '2 days 1 hour') $$,
  '42501', null, 'cannot put a shift on another business''s employee'
);
select throws_ok(
  $$ insert into public.punches (employee_id, punched_at, source) values ('55555555-0000-0000-0000-0000000000e1', now(), 'manual') $$,
  '42501', null, 'cannot clock in another business''s employee'
);
select throws_ok(
  $$ insert into public.employees (business_id, full_name) values ('55555555-0000-0000-0000-000000000001', 'Sneaky') $$,
  '42501', null, 'cannot add staff to another business'
);
select throws_ok(
  $$ update public.employees set business_id = '55555555-0000-0000-0000-000000000001' where id = '11111111-0000-0000-0000-000000000004' $$,
  '42501', null, 'cannot move own staff to another business'
);
select throws_ok(
  $$ update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', null, 'a manager cannot make themselves platform admin'
);
select throws_ok(
  $$ insert into public.shifts (employee_id, branch_id, starts_at, ends_at)
     values ('11111111-0000-0000-0000-000000000002', '55555555-0000-0000-0000-0000000000b1', now() + interval '3 days', now() + interval '3 days 1 hour') $$,
  '23503', null, 'cannot rota own staff at another business''s branch'
);

update public.employees set full_name = 'Hacked' where id = '55555555-0000-0000-0000-0000000000e1';
delete from public.shifts where employee_id = '55555555-0000-0000-0000-0000000000e1';

insert into public.employees (full_name, device_user_id) values ('New Starter', '99');
select is(
  (select business_id from public.employees where full_name = 'New Starter'),
  '44444444-0000-0000-0000-000000000001'::uuid,
  'new staff join the manager''s business by default'
);

-- ---------------------------------------------------------------------------
-- An employee of Parkway
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000a002", "role": "authenticated"}', true);
select is((select count(*)::int from public.employees), 1, 'an employee sees only their own staff record');
select is((select count(*)::int from public.shifts where employee_id <> '11111111-0000-0000-0000-000000000001'), 0, 'an employee sees only their own shifts');

-- ---------------------------------------------------------------------------
-- The other business's manager
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "55555555-0000-0000-0000-00000000a001", "role": "authenticated"}', true);
select is((select count(*)::int from public.employees), 1, 'the other manager sees only their own staff');
select is((select count(*)::int from public.punches), 0, 'the other manager sees none of Parkway''s scans');
select is((select count(*)::int from public.devices), 0, 'the other manager sees none of Parkway''s terminals');

reset role;
select is((select full_name from public.employees where id = '55555555-0000-0000-0000-0000000000e1'), 'Oscar Other', 'Parkway''s manager could not rename another business''s staff');
select is((select count(*)::int from public.shifts where employee_id = '55555555-0000-0000-0000-0000000000e1'), 1, 'Parkway''s manager could not delete another business''s shifts');

-- ---------------------------------------------------------------------------
-- Terminals
-- ---------------------------------------------------------------------------
select is((public.touch_device('NEWTERM01', '1.2.3.4', 'other')).business_id, '55555555-0000-0000-0000-000000000001'::uuid,
  'a new terminal joins the business whose subdomain it called');
select is((public.touch_device('CQZ7232460123', '1.2.3.4', 'other')).business_id, '44444444-0000-0000-0000-000000000001'::uuid,
  'a known terminal can''t be taken over by calling another subdomain');
select is((public.touch_device('LOOSE0001', '1.2.3.4', null)).business_id, null,
  'a terminal that called the bare domain belongs to no business');

-- Fingerprint ID "1" on the other business's terminal is Oscar, not Parkway's Amira.
update public.devices set enabled = true, branch_id = '55555555-0000-0000-0000-0000000000b1' where serial_number = 'NEWTERM01';
select public.ingest_device_punches('NEWTERM01', '1.2.3.4', '[{"user_id": "1", "time": "2026-10-09 09:00:00", "verify": "1", "raw": "x"}]', 'other');
select is(
  (select employee_id from public.punches where device_id = (select id from public.devices where serial_number = 'NEWTERM01')),
  '55555555-0000-0000-0000-0000000000e1'::uuid,
  'a scan is matched to the employee of the terminal''s business'
);

select * from finish();
rollback;
