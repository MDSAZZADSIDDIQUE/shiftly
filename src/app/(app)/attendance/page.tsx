import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangleIcon, ClockIcon, UsersIcon } from 'lucide-react'
import { DateNav } from '@/components/date-nav'
import { Measure } from '@/components/measure'
import { LiveDuration, LiveRefresh } from '@/components/live'
import { EmptyState, PageHeader, Panel, PersonAvatar } from '@/components/people'
import { DayTimeline } from '@/components/timeline'
import { HoursBar, hoursStatus } from '@/components/visuals'
import { addSession, deleteSession, setDayHours, updateSession } from '@/lib/actions/attendance'
import {
  formatDuration,
  formatMinutes,
  isDateString,
  londonDate,
  londonTime,
  londonToday,
  prettyDate,
  requestTime,
} from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { AttendanceSession, DailySummary, Employee, LeaveRequest, Shift } from '@/lib/types'
import { SessionDialog, SetHoursDialog } from './session-dialogs'

export const metadata: Metadata = { title: 'Attendance' }

const STALE_MS = 16 * 3600 * 1000

type Row = {
  e: Employee
  s: DailySummary | undefined
  mine: AttendanceSession[]
  open: AttendanceSession | undefined
  closedSeconds: number
  onLeave: boolean
  scheduled: Shift[]
  target: number | null
  index: number
}

export default async function AttendancePage({ searchParams }: PageProps<'/attendance'>) {
  const params = await searchParams
  const today = londonToday()
  const date = isDateString(params.date) ? params.date : today

  const supabase = await createClient()
  const [employeesRes, summaryRes, sessionsRes, shiftsRes, leaveRes] = await Promise.all([
    supabase.from('employees').select('*').order('full_name'),
    supabase.from('daily_summary').select('*').eq('work_date', date),
    supabase.from('attendance_sessions').select('*').eq('work_date', date).order('clock_in'),
    supabase.from('shifts').select('*').eq('shift_date', date).order('starts_at'),
    supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', date).gte('end_date', date),
  ])

  const summary = (summaryRes.data ?? []) as DailySummary[]
  const sessions = (sessionsRes.data ?? []) as AttendanceSession[]
  const shifts = (shiftsRes.data ?? []) as Shift[]
  const leave = (leaveRes.data ?? []) as LeaveRequest[]
  const summaryById = new Map(summary.map((s) => [s.employee_id, s]))
  const employees = ((employeesRes.data ?? []) as Employee[]).filter((e) => e.active || summaryById.has(e.id))
  const now = requestTime()

  const rows: Row[] = employees.map((e) => {
    const s = summaryById.get(e.id)
    const mine = sessions.filter((x) => x.employee_id === e.id)
    return {
      e,
      s,
      mine,
      open: mine.find((x) => !x.clock_out && now - new Date(x.clock_in).getTime() < STALE_MS),
      closedSeconds: mine
        .filter((x) => x.clock_out)
        .reduce((sum, x) => sum + (new Date(x.clock_out!).getTime() - new Date(x.clock_in).getTime()) / 1000, 0),
      onLeave: leave.some((l) => l.employee_id === e.id),
      scheduled: shifts.filter((x) => x.employee_id === e.id),
      target: s?.approved_minutes ?? e.daily_minutes,
      index: 0,
    }
  })
  // People who worked first, then everyone else.
  rows.sort((a, b) => Number((b.s?.worked_seconds ?? 0) > 0) - Number((a.s?.worked_seconds ?? 0) > 0))
  rows.forEach((r, i) => (r.index = i))

  const totalWorked = summary.reduce((sum, s) => sum + s.worked_seconds, 0)
  const totalPaid = summary.reduce((sum, s) => sum + s.paid_minutes, 0)
  const present = summary.filter((s) => s.worked_seconds > 0).length

  return (
    <>
      <PageHeader
        title="Attendance"
        description={prettyDate(date, 'EEEE d MMMM yyyy')}
        actions={
          <>
            {date === today && <LiveRefresh />}
            <DateNav path="/attendance" date={date} today={today} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Summary icon={<UsersIcon />} label="Came in" value={`${present}`} sub={`of ${employees.filter((e) => e.active).length}`} />
        <Summary icon={<ClockIcon />} label="Worked" value={formatMinutes(Math.floor(totalWorked / 60))} />
        <Summary icon={<ClockIcon />} label="To pay" value={formatMinutes(totalPaid)} accent />
      </div>

      <Panel className="mb-6" title="Timeline">
        <DayTimeline date={date} employees={employees} sessions={sessions} shifts={shifts} nowIso={new Date(now).toISOString()} isToday={date === today} />
      </Panel>

      <Panel
        title="Hours by employee"
        info="Paid hours use the hours you set for the day, otherwise the employee's usual hours (capped at time actually worked)."
        bodyClassName="p-0 sm:px-0"
       
      >
        {rows.length === 0 ? (
          <EmptyState icon={<UsersIcon />} title="No employees yet">Add your team on the Employees page.</EmptyState>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Clock in → out</th>
                    <th className="w-[30%] px-3 py-2 font-medium">Worked vs set hours</th>
                    <th className="px-5 py-2 text-right font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.e.id}
                      className="rise-in group/row border-b align-top transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-5 py-3"><Who r={r} /></td>
                      <td className="px-3 py-3"><Sessions r={r} date={date} now={now} /></td>
                      <td className="px-3 py-3"><Worked r={r} now={now} /></td>
                      <td className="px-5 py-3 text-right"><Paid r={r} date={date} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="divide-y border-t md:hidden">
              {rows.map((r) => (
                <li key={r.e.id} className="rise-in group/row grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Who r={r} />
                    <Paid r={r} date={date} />
                  </div>
                  <Worked r={r} now={now} />
                  <Sessions r={r} date={date} now={now} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </>
  )
}

function Summary({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn('surface rise-in rounded-2xl px-4 py-3', accent && 'ring-1 ring-primary/30')}>
      <p className="eyebrow flex items-center gap-1.5 [&_svg]:size-3.5">{icon}{label}</p>
      <p className={cn('mt-2 font-display text-xl font-light tracking-tight whitespace-nowrap tabular-nums sm:text-[1.75rem]', accent && 'text-primary')}>
        <Measure>{value}</Measure>
        {sub && <span className="ml-1 text-sm font-normal text-muted-foreground">{sub}</span>}
      </p>
    </div>
  )
}

function Who({ r }: { r: Row }) {
  const status = r.open ? 'in' : r.s?.missed_clock_out ? 'warn' : undefined
  return (
    <div className="flex items-center gap-2.5">
      <PersonAvatar name={r.e.full_name} color={r.e.color} size="sm" status={status} muted={!r.s && !r.onLeave && r.scheduled.length === 0} />
      <div className="min-w-0">
        <Link href={`/employees/${r.e.id}`} className="font-medium hover:underline">{r.e.full_name}</Link>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {r.onLeave && <span className="tone-amber rounded-full px-1.5 py-px text-[0.68rem] font-medium">Holiday</span>}
          {r.scheduled.map((x) => (
            <span key={x.id} className="rounded-full border px-1.5 py-px text-[0.68rem] text-muted-foreground tabular-nums">
              Shift {londonTime(x.starts_at)}–{londonTime(x.ends_at)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Sessions({ r, date, now }: { r: Row; date: string; now: number }) {
  return (
    <div className="grid gap-1">
      {r.mine.map((x) => {
        const stale = !x.clock_out && now - new Date(x.clock_in).getTime() > STALE_MS
        return (
          <div key={x.id} className="flex items-center gap-1.5 tabular-nums">
            <span className="font-medium">{londonTime(x.clock_in)}</span>
            <span className="text-muted-foreground">→</span>
            {x.clock_out ? (
              <span className="font-medium">
                {londonTime(x.clock_out)}
                {londonDate(x.clock_out) !== x.work_date && <sup className="text-muted-foreground"> +1</sup>}
              </span>
            ) : stale ? (
              <span className="inline-flex items-center gap-1 text-warning-text"><AlertTriangleIcon className="size-3.5" /> No clock out</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-success-text">
                <span className="size-1.5 animate-pulse rounded-full bg-success" /> working
              </span>
            )}
            {x.edited && <span className="tone-zinc rounded px-1 text-[0.65rem]" title={x.note ?? 'Edited by manager'}>edited</span>}
            <SessionDialog
              mode="edit"
              date={x.work_date}
              clockIn={londonTime(x.clock_in)}
              clockOut={x.clock_out ? londonTime(x.clock_out) : ''}
              note={x.note}
              action={updateSession.bind(null, x.id)}
              deleteAction={deleteSession.bind(null, x.id)}
            />
          </div>
        )
      })}
      {r.mine.length === 0 && <span className="text-muted-foreground">{r.onLeave ? 'On holiday' : 'No clock in'}</span>}
      <div className="-ml-2">
        <SessionDialog mode="add" date={date} action={addSession.bind(null, r.e.id)} />
      </div>
    </div>
  )
}

function Worked({ r, now }: { r: Row; now: number }) {
  const worked = r.s?.worked_seconds ?? 0
  if (worked === 0 && !r.open) return <span className="text-muted-foreground">—</span>
  const status = hoursStatus(worked / 60, r.target, !r.open)
  const diff = r.target ? Math.round(worked / 60 - r.target) : 0
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums">
          {r.open ? <LiveDuration since={r.open.clock_in} baseSeconds={r.closedSeconds} serverNow={now} /> : formatDuration(worked)}
        </span>
        {r.target != null && (
          <span
            className={cn(
              'text-xs tabular-nums',
              status === 'short' && 'text-warning-text',
              status === 'over' && 'text-overtime-text',
              status === 'on-track' && 'text-muted-foreground'
            )}
          >
            {status === 'over' ? `+${formatMinutes(diff)} over` : status === 'short' ? `${formatMinutes(-diff)} short` : `of ${formatMinutes(r.target)}`}
          </span>
        )}
      </div>
      <HoursBar workedMinutes={worked / 60} targetMinutes={r.target} finished={!r.open} />
    </div>
  )
}

function Paid({ r, date }: { r: Row; date: string }) {
  const overridden = r.s?.approved_minutes != null
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <span className="text-base font-semibold tabular-nums">{r.s ? formatMinutes(r.s.paid_minutes) : '—'}</span>
        <SetHoursDialog
          name={r.e.full_name}
          action={setDayHours.bind(null, r.e.id, date)}
          current={r.s?.approved_minutes ?? null}
          defaultMinutes={r.e.daily_minutes}
          workedLabel={formatDuration(r.s?.worked_seconds ?? 0)}
        />
      </div>
      {overridden && (
        <span className="tone-brass rounded-full px-1.5 py-px text-[0.65rem] font-medium" title={r.s?.approval_note ?? undefined}>
          Set by you
        </span>
      )}
      {r.s?.approval_note && <span className="max-w-40 truncate text-[0.7rem] text-muted-foreground">{r.s.approval_note}</span>}
    </div>
  )
}
