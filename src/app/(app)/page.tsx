import Link from 'next/link'
import { ViewTransition } from 'react'
import { AlarmClockIcon, ClockIcon, FingerprintIcon, UserPlusIcon } from 'lucide-react'
import { HoursChart } from '@/components/charts'
import { CountUp } from '@/components/count-up'
import { PunchMenu, WorkingCard } from '@/components/dashboard-cards'
import { LiveRefresh } from '@/components/live'
import { EmptyState, GroupLabel, InfoTip, PageHeader, Panel, PersonAvatar } from '@/components/people'
import { DayTimeline } from '@/components/timeline'
import { Delta, HoursBar } from '@/components/visuals'
import { Button } from '@/components/ui/button'
import { manualPunch } from '@/lib/actions/attendance'
import {
  formatDuration,
  londonDate,
  londonTime,
  londonTimeSeconds,
  londonToday,
  minutesToHours,
  prettyDate,
  requestTime,
  shiftDate,
} from '@/lib/format'
import { STORE } from '@/lib/store'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { AttendanceSession, CalendarDay, DailySummary, Employee, LeaveRequest, Punch, Shift } from '@/lib/types'

const STALE_MS = 16 * 3600 * 1000

function sessionSeconds(s: AttendanceSession, until: number) {
  const end = Math.min(s.clock_out ? new Date(s.clock_out).getTime() : until, until)
  return Math.max(0, (end - new Date(s.clock_in).getTime()) / 1000)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = londonToday()
  const now = requestTime()
  const nowIso = new Date(now).toISOString()

  const [employeesRes, summaryRes, sessionsRes, shiftsRes, leaveRes, trendRes, punchesRes, lastWeekRes, pendingRes] =
    await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('full_name'),
      supabase.from('daily_summary').select('*').eq('work_date', today),
      supabase.from('attendance_sessions').select('*').eq('work_date', today).order('clock_in'),
      supabase.from('shifts').select('*').eq('shift_date', today).order('starts_at'),
      supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
      supabase.rpc('calendar_summary', { p_from: shiftDate(today, -13), p_to: today }),
      supabase.from('punches').select('*').order('punched_at', { ascending: false }).limit(8),
      supabase.from('attendance_sessions').select('*').eq('work_date', shiftDate(today, -7)),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

  const employees = (employeesRes.data ?? []) as Employee[]
  const summary = (summaryRes.data ?? []) as DailySummary[]
  const sessions = (sessionsRes.data ?? []) as AttendanceSession[]
  const shifts = (shiftsRes.data ?? []) as Shift[]
  const leave = (leaveRes.data ?? []) as LeaveRequest[]
  const trend = (trendRes.data ?? []) as CalendarDay[]
  const punches = (punchesRes.data ?? []) as Punch[]
  const lastWeek = (lastWeekRes.data ?? []) as AttendanceSession[]
  const pendingLeave = pendingRes.count ?? 0

  const byId = new Map(employees.map((e) => [e.id, e]))
  const summaryById = new Map(summary.map((s) => [s.employee_id, s]))
  const onLeave = new Set(leave.map((l) => l.employee_id))

  // Group the team by where they are in their day.
  const working: { e: Employee; open: AttendanceSession; closedSeconds: number }[] = []
  const finished: { e: Employee; s: DailySummary }[] = []
  const late: { e: Employee; shift: Shift }[] = []
  const later: { e: Employee; shift: Shift }[] = []
  const holiday: Employee[] = []
  const off: Employee[] = []
  for (const e of employees) {
    const mine = sessions.filter((s) => s.employee_id === e.id)
    const open = mine.find((s) => !s.clock_out && now - new Date(s.clock_in).getTime() < STALE_MS)
    const s = summaryById.get(e.id)
    const shift = shifts.find((x) => x.employee_id === e.id && new Date(x.ends_at).getTime() > now)
    if (open) {
      const closedSeconds = mine.filter((x) => x.clock_out).reduce((sum, x) => sum + sessionSeconds(x, now), 0)
      working.push({ e, open, closedSeconds })
    } else if (s && s.worked_seconds > 0) finished.push({ e, s })
    else if (onLeave.has(e.id)) holiday.push(e)
    else if (shift && new Date(shift.starts_at).getTime() <= now) late.push({ e, shift })
    else if (shift) later.push({ e, shift })
    else off.push(e)
  }
  later.sort((a, b) => a.shift.starts_at.localeCompare(b.shift.starts_at))

  const workedToday = summary.reduce((sum, s) => sum + s.worked_seconds, 0)
  // Same weekday last week, counted only up to this time of day, so the comparison is fair.
  const cutoff = now - 7 * 24 * 3600 * 1000
  const workedLastWeek = lastWeek.reduce((sum, s) => sum + sessionSeconds(s, cutoff), 0)
  const scheduledPeople = new Set(shifts.map((s) => s.employee_id))
  const nextShift = later[0]

  const chartData = trend.map((d) => ({
    label: prettyDate(d.day, 'EEE d'),
    worked: Math.round((d.worked_seconds / 3600) * 10) / 10,
    paid: minutesToHours(d.paid_minutes),
  }))

  return (
    <>
      <PageHeader
        title="Today"
        description={`${prettyDate(today, 'EEEE d MMMM')} · ${STORE.name}`}
        actions={<LiveRefresh />}
      />

      {/* The day at a glance: the timeline leads, the headline figures sit underneath it. */}
      <section className="surface rise-in overflow-hidden rounded-2xl">
        <header className="flex items-center gap-1.5 px-4 pt-5 sm:px-6">
          <h2 className="eyebrow">Day</h2>
          <InfoTip>Solid bars are time worked, dashed outlines are scheduled shifts, and the brass line is now.</InfoTip>
        </header>
        <div className="px-4 pt-3 pb-5 sm:px-6">
          <DayTimeline date={today} employees={employees} sessions={sessions} shifts={shifts} nowIso={nowIso} isToday size="lg" />
        </div>
        <div className="grid grid-cols-2 gap-px border-t bg-border xl:grid-cols-4">
          <Figure
            label="Clocked in"
            href="/attendance"
            value={
              <>
                <CountUp value={working.length} />
                <span className="unit">/{employees.length}</span>
              </>
            }
            hint={working.map((w) => w.e.full_name.split(' ')[0]).join(', ') || 'Nobody yet'}
          />
          <Figure
            label="Worked today"
            href="/attendance"
            value={<CountUp value={Math.floor(workedToday / 60)} format="minutes" />}
            hint={workedLastWeek > 0 ? <Delta current={workedToday} previous={workedLastWeek} suffix="vs last week" /> : 'All staff'}
          />
          <Figure
            label="On the rota"
            href="/calendar"
            value={<CountUp value={scheduledPeople.size} />}
            hint={nextShift ? `Next: ${nextShift.e.full_name.split(' ')[0]} at ${londonTime(nextShift.shift.starts_at)}` : `${shifts.length} shift${shifts.length === 1 ? '' : 's'}`}
          />
          <Figure
            label="On holiday"
            href="/leave"
            value={<CountUp value={onLeave.size} />}
            hint={
              pendingLeave > 0 ? (
                <span className="font-medium text-warning-text">
                  {pendingLeave} request{pendingLeave === 1 ? '' : 's'} to review
                </span>
              ) : (
                leave.map((l) => byId.get(l.employee_id)?.full_name.split(' ')[0]).filter(Boolean).join(', ') || 'Everyone available'
              )
            }
          />
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Panel title="Who's in" info="Rings fill toward the hours you set for each person's day.">
            {employees.length === 0 ? (
              <EmptyState
                icon={<UserPlusIcon />}
                title="No staff yet"
                action={<Button nativeButton={false} render={<Link href="/employees" />}>Add staff</Button>}
              />
            ) : (
              <div className="grid gap-5">
                <section>
                  <GroupLabel count={working.length} dot="var(--success)">Working now</GroupLabel>
                  {working.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nobody&apos;s in yet.</p>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {working.map(({ e, open, closedSeconds }) => (
                        // Named per person: when someone clocks in or out, their card glides to its new group.
                        <ViewTransition key={e.id} name={`person-${e.id}`} default="item">
                          <WorkingCard
                            employeeId={e.id}
                            name={e.full_name}
                            color={e.color}
                            since={open.clock_in}
                            sinceLabel={londonTime(open.clock_in)}
                            closedSeconds={closedSeconds}
                            targetMinutes={summaryById.get(e.id)?.approved_minutes ?? e.daily_minutes}
                            serverNow={now}
                            action={manualPunch.bind(null, e.id)}
                          />
                        </ViewTransition>
                      ))}
                    </div>
                  )}
                </section>

                {(late.length > 0 || later.length > 0) && (
                  <section>
                    <GroupLabel count={late.length + later.length} dot="var(--info)">Due in</GroupLabel>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {late.map(({ e, shift }) => (
                        <PersonRow key={e.id} e={e} punch>
                          <span className="inline-flex items-center gap-1 font-medium text-warning-text">
                            <AlarmClockIcon className="size-3.5" /> Late · shift started {londonTime(shift.starts_at)}
                          </span>
                        </PersonRow>
                      ))}
                      {later.map(({ e, shift }) => (
                        <PersonRow key={e.id} e={e} muted punch>
                          Shift {londonTime(shift.starts_at)}–{londonTime(shift.ends_at)}
                        </PersonRow>
                      ))}
                    </ul>
                  </section>
                )}

                {finished.length > 0 && (
                  <section>
                    <GroupLabel count={finished.length} dot="var(--overtime)">Finished today</GroupLabel>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {finished.map(({ e, s }) => (
                        <PersonRow key={e.id} e={e} punch>
                          <span className="tabular-nums">
                            {formatDuration(s.worked_seconds)} · out {londonTime(s.last_out)}
                            {s.missed_clock_out && <span className="ml-1 text-warning-text">· no scan out</span>}
                          </span>
                          <HoursBar
                            className="mt-1.5"
                            workedMinutes={s.worked_seconds / 60}
                            targetMinutes={s.approved_minutes ?? e.daily_minutes}
                            finished
                          />
                        </PersonRow>
                      ))}
                    </ul>
                  </section>
                )}

                {(holiday.length > 0 || off.length > 0) && (
                  <section className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4">
                    {holiday.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">On holiday</span>
                        <AvatarStack people={holiday} />
                      </div>
                    )}
                    {off.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Off today</span>
                        <AvatarStack people={off} muted />
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Last 14 days" info="Hours worked against paid hours, across the whole team.">
            <HoursChart data={chartData} />
          </Panel>
        </div>

        <Panel title="Scans" className="h-fit">
          {punches.length === 0 ? (
            <EmptyState icon={<FingerprintIcon />} title="No scans yet" compact>
              Each scan on the terminal shows here straight away.
            </EmptyState>
          ) : (
            <ol className="relative grid gap-2 before:absolute before:inset-y-2 before:left-3.5 before:w-px before:bg-border">
              {punches.map((p) => {
                const e = p.employee_id ? byId.get(p.employee_id) : undefined
                const isNew = now - new Date(p.punched_at).getTime() < 60_000
                return (
                  // Named per scan: a new scan slides in at the top and the rest move down.
                  <ViewTransition key={p.id} name={`scan-${p.id}`} default="item">
                    <li
                      className={cn('rise-in relative -mx-2 flex items-center gap-3 rounded-lg px-2 py-1', isNew && 'flash')}
                    >
                      {e ? (
                        <PersonAvatar name={e.full_name} color={e.color} size="sm" />
                      ) : (
                        <span className="relative flex size-7 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-card">?</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e?.full_name ?? `Unknown user #${p.device_user_id}`}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          {p.source === 'manual' ? <ClockIcon className="size-3" /> : <FingerprintIcon className="size-3" />}
                          {londonDate(p.punched_at) === today ? 'Today' : prettyDate(londonDate(p.punched_at), 'd MMM')} {londonTimeSeconds(p.punched_at)}
                          {p.source === 'manual' && ' · by manager'}
                        </p>
                      </div>
                      <PunchBadge outcome={p.outcome} />
                    </li>
                  </ViewTransition>
                )
              })}
            </ol>
          )}
        </Panel>
      </div>
    </>
  )
}

/** One headline figure in the "Today" strip, linking to the page with the detail. */
function Figure({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-2 bg-card px-4 py-4 transition-colors hover:bg-muted/50 sm:px-6">
      <span className="eyebrow">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="shrink-0 font-display text-[1.75rem] leading-none font-light tracking-tight whitespace-nowrap tabular-nums">{value}</span>
        {hint && <span className="max-w-full min-w-0 truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
    </Link>
  )
}

function PersonRow({
  e,
  muted,
  punch,
  children,
}: {
  e: Employee
  muted?: boolean
  punch?: boolean
  children: React.ReactNode
}) {
  return (
    <ViewTransition name={`person-${e.id}`} default="item">
      <li className="rise-in hoverable flex items-center gap-3 rounded-xl bg-muted/45 p-2.5">
        <PersonAvatar name={e.full_name} color={e.color} muted={muted} />
        <div className="min-w-0 flex-1">
          <Link href={`/employees/${e.id}`} className="block truncate text-sm font-medium hover:underline">{e.full_name}</Link>
          <div className="text-xs text-muted-foreground">{children}</div>
        </div>
        {punch && <PunchMenu employeeId={e.id} name={e.full_name} clockedIn={false} action={manualPunch.bind(null, e.id)} />}
      </li>
    </ViewTransition>
  )
}

function AvatarStack({ people, muted }: { people: Employee[]; muted?: boolean }) {
  return (
    <span className="flex -space-x-2">
      {people.map((e) => (
        <Link
          key={e.id}
          href={`/employees/${e.id}`}
          title={e.full_name}
          className="transition-transform hover:z-10 hover:-translate-y-0.5"
        >
          <PersonAvatar name={e.full_name} color={e.color} size="sm" muted={muted} />
        </Link>
      ))}
    </span>
  )
}

function PunchBadge({ outcome }: { outcome: Punch['outcome'] }) {
  const map = {
    in: ['tone-emerald', 'In'],
    out: ['tone-brass', 'Out'],
    duplicate: ['tone-zinc', 'Repeat'],
    unknown_user: ['tone-rose', 'Unknown'],
  } as const
  const [tone, label] = map[outcome ?? 'unknown_user']
  return <span className={cn('rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', tone)}>{label}</span>
}
