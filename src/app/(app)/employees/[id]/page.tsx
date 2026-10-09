import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ViewTransition } from 'react'
import { BadgePoundSterlingIcon, CalendarCheckIcon, ClockIcon, FingerprintIcon, PoundSterlingIcon, Trash2Icon } from 'lucide-react'
import { HoursChart } from '@/components/charts'
import { ActionButton, Field, FormDialog } from '@/components/forms'
import { EmptyState, Panel, PersonAvatar, StatCard } from '@/components/people'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { addPayRate, deletePayRate, updateEmployee } from '@/lib/actions/employees'
import { saveUsualWeek } from '@/lib/actions/rota'
import {
  formatDuration,
  formatMinutes,
  formatPence,
  londonTime,
  londonToday,
  minutesToHours,
  prettyDate,
  shiftDate,
} from '@/lib/format'
import { capitalise, getBranches, requireBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import type { DailySummary, Employee, LeaveRequest, PayRate, ShiftPattern, WageRow } from '@/lib/types'
import { EditEmployeeDialog } from '../employee-form'
import { UsualWeekForm } from './usual-week-form'

export const metadata: Metadata = { title: 'Employee' }

export default async function EmployeePage({ params }: PageProps<'/employees/[id]'>) {
  const { id } = await params
  const today = londonToday()
  const from = shiftDate(today, -29)
  const monthStart = `${today.slice(0, 7)}-01`

  const business = await requireBusiness()
  const supabase = await createClient()
  const [{ data: employee }, branches] = await Promise.all([
    supabase.from('employees').select('*').eq('id', id).maybeSingle<Employee>(),
    getBranches(business.id),
  ])
  if (!employee) notFound()
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }))
  const branchLabel = capitalise(business.branch_word)
  const homeBranch = branches.find((b) => b.id === employee.branch_id)

  const [ratesRes, daysRes, leaveRes, wageRes, patternsRes] = await Promise.all([
    supabase.from('pay_rates').select('*').eq('employee_id', id).order('effective_from', { ascending: false }),
    supabase.from('daily_summary').select('*').eq('employee_id', id).gte('work_date', from).order('work_date', { ascending: false }),
    supabase.from('leave_requests').select('*').eq('employee_id', id).order('start_date', { ascending: false }).limit(10),
    supabase.rpc('wage_report', { p_from: monthStart, p_to: today }),
    supabase.from('shift_patterns').select('*').eq('employee_id', id).order('weekday'),
  ])

  const rates = (ratesRes.data ?? []) as PayRate[]
  const days = (daysRes.data ?? []) as DailySummary[]
  const leave = (leaveRes.data ?? []) as LeaveRequest[]
  const wage = ((wageRes.data ?? []) as WageRow[]).find((w) => w.employee_id === id)
  const patterns = (patternsRes.data ?? []) as ShiftPattern[]

  const byDate = new Map(days.map((d) => [d.work_date, d]))
  const chart = Array.from({ length: 30 }, (_, i) => {
    const date = shiftDate(from, i)
    const d = byDate.get(date)
    return {
      label: prettyDate(date, 'd MMM'),
      worked: d ? Math.round((d.worked_seconds / 3600) * 10) / 10 : 0,
      paid: d ? minutesToHours(d.paid_minutes) : 0,
    }
  })

  return (
    <>
      <div
        className="surface rise-in mb-6 flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center"
        style={{ background: `linear-gradient(120deg, ${employee.color}1f, transparent 60%), var(--card)` }}
      >
        <ViewTransition name={`avatar-${employee.id}`} share="morph" default="none">
          <span className="inline-flex">
            <PersonAvatar name={employee.full_name} color={employee.color} size="lg" />
          </span>
        </ViewTransition>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {employee.full_name}
            {!employee.active && <span className="tone-zinc rounded-full px-2 py-0.5 text-xs font-medium">Left</span>}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span>{employee.job_title ?? 'Team member'}</span>
            <span className="inline-flex items-center gap-1">
              <FingerprintIcon className="size-3.5" />
              {employee.device_user_id ? `User #${employee.device_user_id}` : 'Not enrolled'}
            </span>
            {homeBranch && branches.length > 1 && <span>{homeBranch.name}</span>}
            {employee.email && <span>{employee.email}</span>}
            {employee.phone && <span>{employee.phone}</span>}
          </p>
        </div>
        <EditEmployeeDialog
          employee={employee}
          action={updateEmployee.bind(null, id)}
          branch={{ branches: branchOptions, label: branchLabel, defaultId: null }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<ClockIcon />} label="Usual day" value={formatMinutes(employee.daily_minutes)} hint={employee.daily_minutes == null ? 'Paid for time worked' : 'Set by you'} />
        <StatCard icon={<CalendarCheckIcon />} label="Paid this month" value={formatMinutes(Number(wage?.paid_minutes ?? 0))} hint={`${wage?.days_worked ?? 0} days worked`} />
        <StatCard icon={<PoundSterlingIcon />} label="Earned this month" value={formatPence(Number(wage?.gross_pence ?? 0))} hint="Gross, before tax" />
        <StatCard icon={<BadgePoundSterlingIcon />} label="Current rate" value={rates[0] ? formatPence(rates.find((r) => r.effective_from <= today)?.hourly_rate_pence ?? rates[0].hourly_rate_pence) : '—'} hint="per hour" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Panel title="Last 30 days" description="Hours worked vs paid">
            <HoursChart data={chart} height={220} color={employee.color} />
          </Panel>

          <Panel title="Timesheet">
            {days.length === 0 ? (
              <EmptyState icon={<CalendarCheckIcon />} title="No attendance yet" compact>Nothing in the last 30 days.</EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead className="text-right">Worked</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((d) => (
                    <TableRow key={d.work_date}>
                      <TableCell>
                        <Link href={`/attendance?date=${d.work_date}`} className="hover:underline">
                          {prettyDate(d.work_date, 'EEE d MMM')}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{londonTime(d.first_in)}</TableCell>
                      <TableCell className="tabular-nums">
                        {d.is_clocked_in ? <span className="text-success-text">working</span> : d.missed_clock_out ? <span className="text-warning-text">missing</span> : londonTime(d.last_out)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatDuration(d.worked_seconds)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMinutes(d.paid_minutes)}
                        {d.approved_minutes != null && <span className="tone-brass ml-1.5 rounded-full px-1.5 py-px text-[0.65rem]">set</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </div>

        <div className="grid h-fit gap-6">
          <Panel title="Usual week" info="Fill rota on the Rota page uses this to add their shifts. Leave a day empty if they don't work it.">
            <UsualWeekForm
              patterns={patterns}
              action={saveUsualWeek.bind(null, id)}
              branches={branchOptions}
              branchLabel={branchLabel}
              homeBranchId={employee.branch_id}
            />
          </Panel>

          <Panel
            title="Pay rates"
            actions={
              <FormDialog
                title="New hourly rate"
                description="Earlier days keep their old rate."
                trigger={{ label: 'Add rate', size: 'sm', variant: 'outline' }}
                action={addPayRate.bind(null, id)}
                successMessage="Rate added"
              >
                <Field label="Hourly rate (£)">
                  <Input name="hourly_rate" inputMode="decimal" placeholder="12.71" required />
                </Field>
                <Field label="Starts from">
                  <Input type="date" name="effective_from" defaultValue={today} required />
                </Field>
              </FormDialog>
            }
          >
            {rates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rate set — wages will show as £0.</p>
            ) : (
              <ul className="grid gap-2">
                {rates.map((r) => (
                  <li key={r.id} className="rise-in group/row flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{formatPence(r.hourly_rate_pence)}/h</span>
                    <span className="flex-1 text-muted-foreground">from {prettyDate(r.effective_from, 'd MMM yyyy')}</span>
                    <ActionButton variant="ghost" size="icon-xs" action={deletePayRate.bind(null, r.id)} confirm="Delete?" aria-label="Delete rate">
                      <Trash2Icon />
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Holidays" actions={<Link href="/leave" className="text-xs text-primary hover:underline">Manage</Link>}>
            {leave.length === 0 ? (
              <p className="text-sm text-muted-foreground">No holidays booked.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {leave.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <span>
                      {prettyDate(l.start_date, 'd MMM')}
                      {l.end_date !== l.start_date && ` – ${prettyDate(l.end_date, 'd MMM')}`}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${l.status === 'approved' ? 'tone-amber' : l.status === 'pending' ? 'tone-sky' : 'tone-zinc'}`}>{l.leave_type} · {l.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
