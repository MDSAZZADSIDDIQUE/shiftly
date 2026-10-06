-- Usual week: the shifts someone normally works, used to fill the rota in bulk.
-- weekday is ISO: 1 = Monday ... 7 = Sunday. Times are UK local; an end at or before the start runs past midnight.

create table public.shift_patterns (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time <> end_time),
  unique (employee_id, weekday, start_time)
);

create index shift_patterns_employee on public.shift_patterns (employee_id);

alter table public.shift_patterns enable row level security;

create policy "shift_patterns: manager all" on public.shift_patterns
  for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "shift_patterns: read own" on public.shift_patterns
  for select to authenticated using (
    employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );
