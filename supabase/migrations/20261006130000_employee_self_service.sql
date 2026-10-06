-- Employee app (/me): an employee can read their own pay rates, so it can show estimated pay,
-- and withdraw a holiday request that is still waiting for the manager.

create policy "pay_rates: read own" on public.pay_rates
  for select to authenticated using (
    employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );

create policy "leave: withdraw own pending" on public.leave_requests
  for update to authenticated
  using (
    status = 'pending'
    and employee_id in (select id from public.employees where user_id = (select auth.uid()))
  )
  with check (
    status = 'cancelled'
    and employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );
