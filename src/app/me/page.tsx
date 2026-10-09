import type { Metadata } from 'next'
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import {
  BadgePoundSterlingIcon,
  CalendarClockIcon,
  CalendarRangeIcon,
  InboxIcon,
  Link2OffIcon,
  PalmtreeIcon,
  PlaneTakeoffIcon,
  TimerIcon,
  XIcon,
} from 'lucide-react'
import { HoursChart } from '@/components/lazy-charts'
import { ActionButton } from '@/components/forms'
import { LiveRefresh } from '@/components/live'
import { EmptyState, PageHeader, Panel, StatCard } from '@/components/people'
import { DayTimeline } from '@/components/timeline'
import { Ring } from '@/components/visuals'
import { requestLeave, withdrawLeave } from '@/lib/actions/me'
import {
  formatMinutes,
  formatPence,
  londonTime,
  londonToday,
  minutesToHours,
  prettyDate,
  requestTime,
  shiftDate,
} from '@/lib/format'
import { getBranches, openingHoursOn, requireBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { AttendanceSession, DailySummary, Employee, LeaveRequest, Shift, WageRow } from '@/lib/types'
import { RequestLeaveDialog } from './request-leave-dialog'
import { TodayRing } from './today-ring'

export const metadata: Metadata = { title: 'My shifts' }

const STALE_MS = 16 * 3600 * 1000
/** Statutory minimum for full-time staff (5.6 weeks). Part-time allowances are pro rata. */
const ANNUAL_DAYS = 28
/** A first scan up to five minutes after the rota start still counts as on time. */
const GRACE_MS = 5 * 60 * 1000
/** Rota bars are drawn across this part of the day (minutes after midnight). */
const DAY_START = 6 * 60
const DAY_END = 22 * 60

function leaveDays(l: LeaveRequest) {
  return differenceInCalendarDays(parseISO(l.end_date), parseISO(l.start_date)) + 1
}

function dayLabel(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === shiftDate(today, 1)) return 'Tomorrow'
  return prettyDate(date, 'EEE d MMM')
}

function shiftMinutes(s: Shift) {
  return Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)
}

/** Minutes after London midnight, from an "HH:MM" London time. */
function minuteOfDay(iso: string) {
  const [h, m] = londonTime(iso).split(':').map(Number)
  return h * 60 + m
}

/** "7.9h": short enough for seven columns on a phone. */
function shortHours(minutes: number) {
  return `${Math.round((minutes / 60) * 10) / 10}h`
}

/** "in 3h 20m", "in 2 days". */
function countdown(fromMs: number, toMs: number) {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / 60000))
  if (minutes < 60) return `in ${minutes}m`
  if (minutes < 24 * 60) return `in ${formatMinutes(minutes)}`
  const days = Math.round(minutes / (24 * 60))
  return `in ${days} day${days === 1 ? '' : 's'}`
}

export default async function MePage() {
  const business = await requireBusiness()
  const branches = await getBranches(business.id)
  const supabase = await createClient()
  const today = londonToday()
  const now = requestTime()
  const nowIso = new Date(now).toISOString()

  // Row level security limits every query below to the signed-in employee's own rows.
  const { data: claims } = await supabase.auth.getClaims()
  const { data: me } = await supabase.from('employees').select('*').eq('user_id', claims?.claims.sub ?? '').maybeSingle()
  if (!me) {
    return (
      <EmptyState icon={<Link2OffIcon />} title="Not linked to a staff record">
        Ask your manager to link your account, then sign in again.
      </EmptyState>
    )
  }
  const employee = me as Employee

  const weekStart = format(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStart = `${today.slice(0, 7)}-01`
  const from = [weekStart, shiftDate(today, -29)].sort()[0]
  const [sessionsRes, daysRes, shiftsRes, leaveRes, weekRes, monthRes] = await Promise.all([
    supabase.from('attendance_sessions').select('*').eq('employee_id', employee.id).eq('work_date', today).order('clock_in'),
    supabase.from('daily_summary').select('*').eq('employee_id', employee.id).gte('work_date', from).lte('work_date', today),
    supabase
      .from('shifts')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('shift_date', from)
      .lte('shift_date', shiftDate(today, 13))
      .order('starts_at'),
    supabase.from('leave_requests').select('*').eq('employee_id', employee.id).order('start_date', { ascending: false }).limit(50),
    supabase.rpc('wage_report', { p_from: weekStart, p_to: today }),
    supabase.rpc('wage_report', { p_from: monthStart, p_to: today }),
  ])

  const sessions = (sessionsRes.data ?? []) as AttendanceSession[]
  const days = (daysRes.data ?? []) as DailySummary[]
  const shifts = (shiftsRes.data ?? []) as Shift[]
  const leave = (leaveRes.data ?? []) as LeaveRequest[]
  const week = ((weekRes.data ?? []) as WageRow[]).find((r) => r.employee_id === employee.id)
  const month = ((monthRes.data ?? []) as WageRow[]).find((r) => r.employee_id === employee.id)
  const dayByDate = new Map(days.map((d) => [d.work_date, d]))
  const approved = leave.filter((l) => l.status === 'approved')
  const onLeave = (date: string) => approved.some((l) => l.start_date <= date && l.end_date >= date)

  // Today
  const open = sessions.find((s) => !s.clock_out && now - new Date(s.clock_in).getTime() < STALE_MS)
  const closedSeconds = sessions
    .filter((s) => s.clock_out)
    .reduce((sum, s) => sum + (new Date(s.clock_out!).getTime() - new Date(s.clock_in).getTime()) / 1000, 0)
  const todaySummary = dayByDate.get(today)
  const target = todaySummary?.approved_minutes ?? employee.daily_minutes
  const todayShifts = shifts.filter((s) => s.shift_date === today)
  // Today's opening hours are those of the branch they're rota'd at, else their home branch.
  const todayBranchId = todayShifts[0]?.branch_id ?? employee.branch_id
  const todayHours = openingHoursOn(today, branches.filter((b) => b.id === todayBranchId))
  const upcoming = shifts.filter((s) => new Date(s.ends_at).getTime() > now)
  const nextShift = upcoming.find((s) => new Date(s.starts_at).getTime() > now)
  const workedToday = (todaySummary?.worked_seconds ?? 0) > 0 || !!open

  // Punctuality over the last 30 days: first scan against the rota start.
  const pastShifts = shifts.filter((s) => s.shift_date >= shiftDate(today, -29) && new Date(s.starts_at).getTime() + GRACE_MS < now && !onLeave(s.shift_date))
  const firstShiftByDay = new Map<string, Shift>()
  for (const s of pastShifts) if (!firstShiftByDay.has(s.shift_date)) firstShiftByDay.set(s.shift_date, s)
  let onTime = 0
  let late = 0
  let missed = 0
  for (const [date, s] of firstShiftByDay) {
    const firstIn = dayByDate.get(date)?.first_in
    if (!firstIn) missed++
    else if (new Date(firstIn).getTime() <= new Date(s.starts_at).getTime() + GRACE_MS) onTime++
    else late++
  }
  const counted = onTime + late + missed

  // This week, Monday to Sunday: hours worked against hours on the rota.
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd')
    const workedMinutes = Math.round((dayByDate.get(date)?.worked_seconds ?? 0) / 60)
    const rotaMinutes = shifts.filter((s) => s.shift_date === date).reduce((sum, s) => sum + shiftMinutes(s), 0)
    return { date, workedMinutes, rotaMinutes, holiday: onLeave(date) }
  })
  const weekScale = Math.max(60, ...weekDays.map((d) => Math.max(d.workedMinutes, d.rotaMinutes)))

  // Last 14 days for the chart.
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const date = shiftDate(today, i - 13)
    const d = dayByDate.get(date)
    return {
      label: prettyDate(date, 'EEE d'),
      worked: Math.round(((d?.worked_seconds ?? 0) / 3600) * 10) / 10,
      paid: minutesToHours(d?.paid_minutes ?? 0),
    }
  })

  // Holidays
  const year = today.slice(0, 4)
  const annualThisYear = approved.filter((l) => l.leave_type === 'annual' && l.start_date.startsWith(year))
  const takenThisYear = annualThisYear.filter((l) => l.end_date < today).reduce((sum, l) => sum + leaveDays(l), 0)
  const bookedThisYear = annualThisYear.filter((l) => l.end_date >= today).reduce((sum, l) => sum + leaveDays(l), 0)
  const daysLeft = Math.max(0, ANNUAL_DAYS - takenThisYear - bookedThisYear)
  const pending = leave.filter((l) => l.status === 'pending')
  const booked = approved.filter((l) => l.end_date >= today).reverse()
  const declined = leave.filter((l) => l.status === 'declined' && l.end_date >= shiftDate(today, -30))
  const nextHoliday = booked.find((l) => l.start_date > today)

  const hasRate = month?.current_rate_pence != null

  return (
    <>
      <PageHeader title={`Hi, ${employee.full_name.split(' ')[0]}`} description={prettyDate(today, 'EEEE d MMMM')} actions={<LiveRefresh />} />

      {/* grid-cols-1 keeps the timeline and chart from widening the page on phones. */}
      <div className="grid grid-cols-1 gap-6">
        {/* Today: ring, status, and the day drawn out */}
        <section className="surface rise-in overflow-hidden rounded-2xl">
          <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-center sm:gap-7">
            {workedToday ? (
              <TodayRing
                since={open?.clock_in ?? null}
                baseSeconds={open ? closedSeconds : (todaySummary?.worked_seconds ?? 0)}
                target={target}
                serverNow={now}
                color={employee.color}
              />
            ) : (
              <Ring value={0} max={1} size={176} stroke={11}>
                <span className="font-display text-[1.7rem] leading-none font-light text-muted-foreground tabular-nums">0h 00m</span>
              </Ring>
            )}
            <div className="min-w-0 text-center sm:text-left">
              <TodayStatus
                open={open}
                summary={todaySummary}
                onHoliday={onLeave(today)}
                todayShift={todayShifts[0]}
                now={now}
              />
              {target != null && (
                <p className="mt-2 text-sm text-muted-foreground">Your usual day is {formatMinutes(target)}.</p>
              )}
            </div>
          </div>
          {(todayShifts.length > 0 || workedToday) && (
            <div className="border-t px-4 pt-4 pb-3 sm:px-5">
              <DayTimeline date={today} employees={[employee]} sessions={sessions} shifts={todayShifts} nowIso={nowIso} isToday showNames={false}
                openHours={todayHours} placeWord={business.place_word} />
            </div>
          )}
        </section>

        {/* Next shift and next holiday */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Countdown
            icon={<CalendarClockIcon />}
            label="Next shift"
            value={nextShift ? `${dayLabel(nextShift.shift_date, today)}, ${londonTime(nextShift.starts_at)}` : 'Not on the rota'}
            hint={nextShift ? `${countdown(now, new Date(nextShift.starts_at).getTime())} · until ${londonTime(nextShift.ends_at)}` : 'Nothing in the next two weeks'}
          />
          <Countdown
            icon={<PlaneTakeoffIcon />}
            label="Next holiday"
            value={nextHoliday ? prettyDate(nextHoliday.start_date, 'EEE d MMM') : 'None booked'}
            hint={
              nextHoliday
                ? `in ${differenceInCalendarDays(parseISO(nextHoliday.start_date), parseISO(today))} days · ${leaveDays(nextHoliday)} day${leaveDays(nextHoliday) === 1 ? '' : 's'} off`
                : `${daysLeft} days left this year`
            }
          />
        </div>

        {/* This week */}
        <Panel title="This week" description={`${formatMinutes(week?.paid_minutes ?? 0)} paid so far${hasRate ? `, about ${formatPence(week?.gross_pence ?? 0)}` : ''}`}>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const isToday = d.date === today
              const future = d.date > today
              return (
                <div key={d.date} className="flex flex-col items-center gap-1.5">
                  <div className="relative flex h-32 w-full items-end justify-center rounded-lg bg-muted/50">
                    {d.rotaMinutes > 0 && (
                      <span
                        className="absolute inset-x-1.5 bottom-0 rounded-md border-2 border-dashed"
                        style={{ height: `${(d.rotaMinutes / weekScale) * 100}%`, borderColor: employee.color, opacity: 0.55 }}
                      />
                    )}
                    {d.workedMinutes > 0 && (
                      <span
                        className="relative w-[calc(100%-0.75rem)] rounded-md transition-[height] duration-700"
                        style={{ height: `${Math.max(4, (d.workedMinutes / weekScale) * 100)}%`, backgroundColor: employee.color }}
                      />
                    )}
                    {d.holiday && <PalmtreeIcon className="absolute top-2 size-4 text-warning-text" />}
                  </div>
                  <span className={cn('text-xs', isToday ? 'font-semibold' : 'text-muted-foreground')}>{prettyDate(d.date, 'EEEEE')}</span>
                  <span className={cn('text-[0.7rem] whitespace-nowrap tabular-nums', future ? 'text-muted-foreground/70' : 'text-muted-foreground')}>
                    {d.workedMinutes > 0 ? shortHours(d.workedMinutes) : d.rotaMinutes > 0 ? shortHours(d.rotaMinutes) : '–'}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: employee.color }} /> Worked</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: employee.color }} /> On the rota</span>
          </div>
        </Panel>

        {/* Pay and punctuality */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={prettyDate(today, 'MMMM')}
            value={formatMinutes(month?.paid_minutes ?? 0)}
            hint={hasRate ? `about ${formatPence(month?.gross_pence ?? 0)}` : 'paid hours'}
            icon={<CalendarRangeIcon />}
          />
          <StatCard
            label="Hourly rate"
            value={hasRate ? formatPence(month?.current_rate_pence) : '—'}
            hint={hasRate ? 'before tax and NI' : 'ask your manager'}
            icon={<BadgePoundSterlingIcon />}
          />
          <div className="surface rise-in relative col-span-2 flex items-center gap-4 overflow-hidden rounded-2xl p-4 sm:p-5">
            <Ring value={onTime} max={Math.max(1, counted)} size={64} stroke={6} color="var(--success)">
              <span className="text-sm font-semibold tabular-nums">{counted ? Math.round((onTime / counted) * 100) : 0}%</span>
            </Ring>
            <div className="min-w-0">
              <p className="eyebrow">On time, last 30 days</p>
              <p className="mt-1 text-sm">
                {counted === 0 ? (
                  <span className="text-muted-foreground">No rota shifts yet.</span>
                ) : (
                  <>
                    <span className="font-medium">{onTime} of {counted} shifts</span>
                    {late > 0 && <span className="text-warning-text"> · {late} late</span>}
                    {missed > 0 && <span className="text-muted-foreground"> · {missed} without a scan</span>}
                  </>
                )}
              </p>
            </div>
            <TimerIcon aria-hidden className="pointer-events-none absolute -right-3 -bottom-5 size-24 -rotate-12 stroke-[1.5] text-foreground/[0.06]" />
          </div>
        </div>

        {/* Last 14 days */}
        <Panel
          title="Last 14 days"
          description="Hours worked and hours paid"
          info={hasRate ? `Pay figures are estimates: gross, before tax and NI, at ${formatPence(month?.current_rate_pence)} an hour. Your payslip is the final word.` : undefined}
        >
          <HoursChart data={chartData} height={200} color={employee.color} />
        </Panel>

        {/* Rota */}
        <Panel title="My rota" description="Next two weeks">
          {upcoming.length === 0 ? (
            <EmptyState icon={<CalendarClockIcon />} title="Nothing on the rota yet" compact />
          ) : (
            <ul className="divide-y">
              {upcoming.map((s) => {
                const a = Math.max(DAY_START, minuteOfDay(s.starts_at))
                const b = Math.min(DAY_END, Math.max(a + 15, minuteOfDay(s.ends_at) || DAY_END))
                return (
                  <li key={s.id} className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[6.5rem_7.5rem_1fr_3rem]">
                    <span className={cn('text-sm', s.shift_date === today ? 'font-semibold' : 'text-muted-foreground')}>{dayLabel(s.shift_date, today)}</span>
                    <span className="text-right font-medium tabular-nums sm:text-left">
                      {londonTime(s.starts_at)}–{londonTime(s.ends_at)}
                    </span>
                    {/* Where the shift sits in the day, 06:00 to 22:00 */}
                    <span className="relative col-span-2 h-2 rounded-full bg-muted sm:col-span-1" aria-hidden>
                      <span
                        className="absolute inset-y-0 rounded-full"
                        style={{
                          left: `${((a - DAY_START) / (DAY_END - DAY_START)) * 100}%`,
                          width: `${((b - a) / (DAY_END - DAY_START)) * 100}%`,
                          backgroundColor: employee.color,
                        }}
                      />
                    </span>
                    <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">{formatMinutes(shiftMinutes(s))}</span>
                    {s.note && <span className="col-span-2 text-xs text-muted-foreground sm:col-span-4">{s.note}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* Holidays */}
        <Panel
          title="Holidays"
          info={`Against ${ANNUAL_DAYS} days, the statutory 5.6 weeks for full-time staff. Part-time allowances are less; your manager can confirm yours.`}
          actions={<RequestLeaveDialog action={requestLeave} today={today} />}
        >
          <div className="grid gap-5">
            <div className="flex items-center gap-4">
              <Ring value={takenThisYear + bookedThisYear} max={ANNUAL_DAYS} size={72} stroke={7} color="var(--warning)">
                <span className="flex flex-col items-center leading-none">
                  <span className="font-display text-xl font-light tabular-nums">{daysLeft}</span>
                  <span className="text-[0.6rem] text-muted-foreground">left</span>
                </span>
              </Ring>
              <div className="grid gap-1 text-sm">
                <span><span className="font-medium tabular-nums">{takenThisYear}</span> <span className="text-muted-foreground">days taken</span></span>
                <span><span className="font-medium tabular-nums">{bookedThisYear}</span> <span className="text-muted-foreground">days booked</span></span>
                <span><span className="font-medium tabular-nums">{daysLeft}</span> <span className="text-muted-foreground">of {ANNUAL_DAYS} left in {year}</span></span>
              </div>
            </div>

            {pending.length === 0 && booked.length === 0 && declined.length === 0 ? (
              <EmptyState icon={<PalmtreeIcon />} title="No time off booked" compact />
            ) : (
              <ul className="divide-y">
                {pending.map((l) => (
                  <LeaveRow key={l.id} l={l} status="Waiting">
                    <ActionButton size="xs" variant="ghost" action={withdrawLeave.bind(null, l.id)} confirm="Tap again" successMessage="Request withdrawn">
                      <XIcon /> Withdraw
                    </ActionButton>
                  </LeaveRow>
                ))}
                {booked.map((l) => (
                  <LeaveRow key={l.id} l={l} status="Approved" />
                ))}
                {declined.map((l) => (
                  <LeaveRow key={l.id} l={l} status="Declined" />
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {pending.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <InboxIcon className="size-3.5" /> Your manager sees waiting requests on their Holidays page.
          </p>
        )}
      </div>
    </>
  )
}

function TodayStatus({
  open,
  summary,
  onHoliday,
  todayShift,
  now,
}: {
  open: AttendanceSession | undefined
  summary: DailySummary | undefined
  onHoliday: boolean
  todayShift: Shift | undefined
  now: number
}) {
  if (open)
    return (
      <>
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-success-text sm:justify-start">
          <span className="breathe size-2 bg-success" /> On the floor
        </p>
        <p className="mt-1 font-display text-2xl font-medium">Since {londonTime(open.clock_in)}</p>
      </>
    )
  if (summary && summary.worked_seconds > 0)
    return (
      <>
        <p className="text-sm font-medium text-muted-foreground">Finished for today</p>
        <p className="mt-1 font-display text-2xl font-medium">
          {londonTime(summary.first_in)}–{summary.last_out ? londonTime(summary.last_out) : '?'}
        </p>
        {summary.missed_clock_out && <p className="mt-1 text-sm text-warning-text">No scan out. Tell your manager when you left.</p>}
      </>
    )
  if (onHoliday) return <p className="font-display text-2xl font-medium">You&apos;re on holiday today.</p>
  if (todayShift) {
    const started = new Date(todayShift.starts_at).getTime() < now
    return (
      <>
        <p className={cn('text-sm font-medium', started ? 'text-warning-text' : 'text-muted-foreground')}>{started ? 'Your shift has started' : 'Working today'}</p>
        <p className="mt-1 font-display text-2xl font-medium tabular-nums">
          {londonTime(todayShift.starts_at)}–{londonTime(todayShift.ends_at)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Scan in on the terminal when you arrive.</p>
      </>
    )
  }
  return <p className="font-display text-2xl font-medium">Not on the rota today.</p>
}

function Countdown({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="surface rise-in flex items-center gap-3.5 rounded-2xl p-4">
      <span className="tone-brass flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="mt-0.5 truncate font-medium">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

const LEAVE_LABEL: Record<LeaveRequest['leave_type'], string> = { annual: 'Annual leave', sick: 'Sick', unpaid: 'Unpaid', other: 'Other' }

const STATUS_TONE = { Waiting: 'tone-amber', Approved: 'tone-emerald', Declined: 'tone-zinc' } as const

function LeaveRow({ l, status, children }: { l: LeaveRequest; status: keyof typeof STATUS_TONE; children?: React.ReactNode }) {
  const n = leaveDays(l)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {prettyDate(l.start_date, 'EEE d MMM')}
          {l.end_date !== l.start_date && ` – ${prettyDate(l.end_date, 'EEE d MMM')}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {n} day{n === 1 ? '' : 's'} · {LEAVE_LABEL[l.leave_type]}
          {l.note && ` · ${l.note}`}
        </p>
      </div>
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[status])}>{status}</span>
      {children}
    </li>
  )
}
