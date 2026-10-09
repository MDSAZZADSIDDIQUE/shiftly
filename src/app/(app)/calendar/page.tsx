import type { Metadata } from 'next'
import Link from 'next/link'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { CalendarPlusIcon, ChevronLeftIcon, ChevronRightIcon, PalmtreeIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import { ActionButton } from '@/components/forms'
import { EmptyState, PageHeader, Panel, PersonAvatar } from '@/components/people'
import { HoursBar } from '@/components/visuals'
import { Button } from '@/components/ui/button'
import { deleteShift, updateShift } from '@/lib/actions/schedule'
import { TZ, formatDuration, formatMinutes, isDateString, londonTime, londonToday, prettyDate, shiftDate } from '@/lib/format'
import { capitalise, getBranches, getSelectedBranch, requireBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { CalendarDay, DailySummary, Employee, LeaveRequest, Shift } from '@/lib/types'
import { TZDate } from '@date-fns/tz'
import { AddShiftForm } from './add-shift-form'
import { CopyWeekDialog, FillRotaDialog } from './bulk-rota'
import { DayPending, RevealDay } from './day-feedback'
import { EditShiftDialog } from './edit-shift-dialog'

export const metadata: Metadata = { title: 'Rota' }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "08:00"–"16:30" -> "8–16:30" */
function compactRange(startIso: string, endIso: string) {
  const short = (iso: string) => {
    const d = new TZDate(iso, TZ)
    return d.getMinutes() === 0 ? `${d.getHours()}` : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${short(startIso)}–${short(endIso)}`
}

type Chip = { id: string; employee: Employee; text: string }

export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const params = await searchParams
  const today = londonToday()
  const month = typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7)
  const selected = isDateString(params.day) ? params.day : month === today.slice(0, 7) ? today : `${month}-01`

  const monthStart = parseISO(`${month}-01`)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 })
  const from = format(gridStart, 'yyyy-MM-dd')
  const to = format(gridEnd, 'yyyy-MM-dd')
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) => format(d, 'yyyy-MM-dd'))

  const business = await requireBusiness()
  const [branches, branch] = await Promise.all([getBranches(business.id), getSelectedBranch(business.id)])
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }))
  const branchLabel = capitalise(business.branch_word)
  const branchName = new Map(branches.map((b) => [b.id, b.name]))

  const supabase = await createClient()
  let shiftsQuery = supabase.from('shifts').select('*').gte('shift_date', from).lte('shift_date', to).order('starts_at')
  if (branch) shiftsQuery = shiftsQuery.eq('branch_id', branch.id)
  const [employeesRes, calRes, shiftsRes, leaveRes, workedRes, patternsRes] = await Promise.all([
    supabase.from('employees').select('*').order('full_name'),
    supabase.rpc('calendar_summary', { p_from: from, p_to: to }),
    shiftsQuery,
    supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', to).gte('end_date', from),
    supabase.from('daily_summary').select('*').gte('work_date', from).lte('work_date', to),
    supabase.from('shift_patterns').select('employee_id, branch_id'),
  ])

  const employees = (employeesRes.data ?? []) as Employee[]
  const byId = new Map(employees.map((e) => [e.id, e]))
  const cal = new Map(((calRes.data ?? []) as CalendarDay[]).map((d) => [d.day, d]))
  const shifts = (shiftsRes.data ?? []) as Shift[]
  const leave = (leaveRes.data ?? []) as LeaveRequest[]
  // At one branch, a past day shows the people based there or rota'd there that day.
  const worked = ((workedRes.data ?? []) as DailySummary[]).filter(
    (d) =>
      d.worked_seconds > 0 &&
      (!branch ||
        byId.get(d.employee_id)?.branch_id === branch.id ||
        shifts.some((x) => x.employee_id === d.employee_id && x.shift_date === d.work_date))
  )
  // Bulk tools: who can be filled from a usual week, and the week of the selected day for copying.
  const withPattern = new Set(
    ((patternsRes.data ?? []) as { employee_id: string; branch_id: string | null }[])
      .filter((p) => !branch || (p.branch_id ?? byId.get(p.employee_id)?.branch_id) === branch.id)
      .map((p) => p.employee_id)
  )
  const fillPeople = employees.filter((e) => e.active && withPattern.has(e.id)).map((e) => ({ id: e.id, name: e.full_name }))
  const selectedWeek = format(startOfWeek(parseISO(selected), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const selectedWeekShifts = shifts.filter((s) => s.shift_date >= selectedWeek && s.shift_date <= shiftDate(selectedWeek, 6)).length

  const hoursFor = (day: string) => {
    if (branch) {
      // The calendar summary covers the whole business, so add up the branch's own figures.
      if (day <= today) return worked.filter((d) => d.work_date === day).reduce((sum, d) => sum + d.worked_seconds, 0) / 3600
      return shifts
        .filter((x) => x.shift_date === day)
        .reduce((sum, x) => sum + (new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime()) / 3600000, 0)
    }
    const d = cal.get(day)
    if (!d) return 0
    return day <= today ? d.worked_seconds / 3600 : d.scheduled_minutes / 60
  }
  const maxHours = Math.max(1, ...days.map(hoursFor))
  const prev = format(addMonths(monthStart, -1), 'yyyy-MM')
  const next = format(addMonths(monthStart, 1), 'yyyy-MM')

  // Past days show who worked and for how long; today and future days show the rota.
  const chipsFor = (day: string): Chip[] => {
    if (day < today) {
      return worked
        .filter((d) => d.work_date === day)
        .sort((a, b) => (a.first_in ?? '').localeCompare(b.first_in ?? ''))
        .flatMap((d) => {
          const e = byId.get(d.employee_id)
          return e ? [{ id: `${day}-${e.id}`, employee: e, text: formatMinutes(Math.floor(d.worked_seconds / 60)) }] : []
        })
    }
    return shifts
      .filter((s) => s.shift_date === day)
      .flatMap((s) => {
        const e = byId.get(s.employee_id)
        return e ? [{ id: s.id, employee: e, text: compactRange(s.starts_at, s.ends_at) }] : []
      })
  }

  const dayShifts = shifts.filter((s) => s.shift_date === selected)
  // Who a shift can be moved to: current staff, plus whoever it belongs to now.
  const staffOptions = (keep: string) => employees.filter((e) => e.active || e.id === keep).map((e) => ({ id: e.id, name: e.full_name }))
  const dayLeave = leave.filter((l) => l.start_date <= selected && l.end_date >= selected)
  const dayWorked = worked.filter((d) => d.work_date === selected)

  return (
    <>
      <PageHeader
        title="Rota"
        actions={
          <>
            <FillRotaDialog from={today} to={shiftDate(today, 27)} people={fillPeople} branch={branch} />
            <CopyWeekDialog week={selectedWeek} label={`week of ${prettyDate(selectedWeek, 'EEE d MMM')}`} shifts={selectedWeekShifts} branch={branch} />
            <div className="surface flex items-center gap-1 rounded-xl p-1">
              <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/calendar?month=${prev}`} aria-label="Previous month" />}>
                <ChevronLeftIcon />
              </Button>
              <span className="w-32 text-center text-sm font-semibold">{format(monthStart, 'MMMM yyyy')}</span>
              <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/calendar?month=${next}`} aria-label="Next month" />}>
                <ChevronRightIcon />
              </Button>
              {month !== today.slice(0, 7) && (
                <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/calendar" />}>Today</Button>
              )}
            </div>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_360px]">
        <div className="surface rise-in min-w-0 rounded-2xl p-2 sm:p-3">
          {/* Phones get a compact month (a dot per person); wider screens get names and times in each day. */}
          <div className="overflow-x-auto overflow-y-hidden">
            <div className="grid grid-cols-7 gap-1 sm:min-w-[700px] sm:gap-1.5">
              {WEEKDAYS.map((d) => (
                <div key={d} className="pb-1 text-center text-xs font-semibold text-muted-foreground sm:px-1.5 sm:text-left">
                  <span className="sm:hidden">{d.slice(0, 1)}</span>
                  <span className="max-sm:hidden">{d}</span>
                </div>
              ))}
              {days.map((day) => {
                const d = cal.get(day)
                const inMonth = day.startsWith(month)
                const intensity = hoursFor(day) / maxHours
                const chips = chipsFor(day)
                const isPast = day < today
                return (
                  <Link
                    key={day}
                    href={`/calendar?month=${month}&day=${day}`}
                    scroll={false}
                    // Diagonal ripple: row + column, so the grid fills in like a wave.
                    className={cn(
                      'rise-in group relative flex min-h-14 flex-col gap-1 overflow-hidden rounded-lg border p-1 text-left transition hover:border-primary/50 sm:min-h-32 sm:gap-1.5 sm:rounded-xl sm:p-2 sm:hover:-translate-y-0.5 sm:hover:shadow-md',
                      !inMonth && 'opacity-40',
                      day === selected && 'border-primary ring-2 ring-primary/30'
                    )}
                  >
                    <span className="absolute inset-0 bg-primary" style={{ opacity: intensity > 0 ? 0.03 + intensity * 0.13 : 0 }} />
                    <DayPending />
                    <span className="relative flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-7 sm:text-sm',
                          day === today && 'bg-primary text-primary-foreground shadow-sm'
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      {d && d.on_leave > 0 && (
                        <PalmtreeIcon className="size-2.5 shrink-0 text-warning-text sm:hidden" aria-label={`${d.on_leave} on holiday`} />
                      )}
                      <span className="flex items-center gap-1.5 max-sm:hidden">
                        {d && d.on_leave > 0 && (
                          <span className="tone-amber flex items-center gap-0.5 rounded-full px-1.5 py-px text-[0.68rem] font-medium" title={`${d.on_leave} on holiday`}>
                            <PalmtreeIcon className="size-3" />
                            {d.on_leave}
                          </span>
                        )}
                        {d && isPast && d.worked_seconds > 0 && (
                          <span className="text-xs font-semibold tabular-nums" title={`${d.employees_worked} worked`}>
                            {formatMinutes(Math.round(d.worked_seconds / 60))}
                          </span>
                        )}
                        {d && !isPast && d.scheduled_minutes > 0 && (
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">{formatMinutes(d.scheduled_minutes)}</span>
                        )}
                      </span>
                    </span>
                    <span className="relative flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-label={`${chips.length} ${isPast ? 'worked' : 'on the rota'}`}>
                      {chips.slice(0, 8).map((c) => (
                        <span key={c.id} className="size-1.5 rounded-full" style={{ backgroundColor: c.employee.color }} />
                      ))}
                    </span>
                    <span className="relative grid gap-1 max-sm:hidden">
                      {chips.slice(0, 3).map((c) => (
                        <span
                          key={c.id}
                          className={cn(
                            'rise-in flex items-center justify-between gap-1 truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-[0.7rem] leading-tight',
                            isPast ? 'bg-card/80' : 'bg-card'
                          )}
                          style={{ borderLeftColor: c.employee.color }}
                        >
                          <span className="truncate font-medium">{c.employee.full_name.split(' ')[0]}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">{c.text}</span>
                        </span>
                      ))}
                      {chips.length > 3 && <span className="px-1 text-[0.68rem] font-medium text-muted-foreground">+{chips.length - 3} more</span>}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1.5 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              Fewer hours
              <span className="flex overflow-hidden rounded">
                {[0.04, 0.07, 0.1, 0.13, 0.16].map((o) => (
                  <span key={o} className="relative size-3.5 bg-card">
                    <span className="absolute inset-0 bg-primary" style={{ opacity: o }} />
                  </span>
                ))}
              </span>
              More hours
            </span>
            <span className="flex items-center gap-1.5 max-sm:hidden">
              <span className="h-3 w-5 rounded-sm border-l-[3px] border-l-primary bg-muted" /> Past days: hours worked · Today on: shift times
            </span>
            <span className="flex items-center gap-1.5 sm:hidden">
              <span className="size-1.5 rounded-full bg-primary" /> A dot per person working · tap a day for details
            </span>
            <span className="flex items-center gap-1.5"><PalmtreeIcon className="size-3.5 text-warning-text" /> On holiday</span>
          </div>
        </div>

        {/* Clears the sticky phone header when scrolled to. */}
        <div className="grid h-fit scroll-mt-20 gap-6 lg:scroll-mt-6">
          {isDateString(params.day) && <RevealDay key={selected} />}
          <Panel
            title={prettyDate(selected, 'EEEE d MMMM')}
            description={`${dayShifts.length} shift${dayShifts.length === 1 ? '' : 's'} · ${formatMinutes(cal.get(selected)?.scheduled_minutes ?? 0)} scheduled`}
           
          >
            {dayShifts.length === 0 ? (
              <EmptyState icon={<CalendarPlusIcon />} title="Nobody on the rota" compact>
                Use the form below to put someone on the rota.
              </EmptyState>
            ) : (
              <ul className="mb-4 grid gap-2">
                {dayShifts.map((s) => {
                  const e = byId.get(s.employee_id)
                  if (!e) return null
                  return (
                    <li
                      key={s.id}
                      className="group/row flex items-center gap-2.5 rounded-xl bg-muted/45 p-2.5"
                      style={{ borderLeft: `4px solid ${e.color}`, backgroundColor: `${e.color}0d` }}
                    >
                      <PersonAvatar name={e.full_name} color={e.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.full_name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {londonTime(s.starts_at)}–{londonTime(s.ends_at)} · {formatMinutes((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)}
                          {!branch && s.branch_id && branches.length > 1 && ` · ${branchName.get(s.branch_id)}`}
                          {s.note && ` · ${s.note}`}
                        </p>
                      </div>
                      <EditShiftDialog
                        // Remount after a save so the form starts from the updated shift.
                        key={`${s.employee_id}-${s.branch_id}-${s.starts_at}-${s.ends_at}-${s.note ?? ''}`}
                        action={updateShift.bind(null, s.id)}
                        name={e.full_name}
                        employeeId={s.employee_id}
                        date={s.shift_date}
                        start={londonTime(s.starts_at)}
                        end={londonTime(s.ends_at)}
                        note={s.note}
                        employees={staffOptions(s.employee_id)}
                        branchId={s.branch_id}
                        branches={branchOptions}
                        branchLabel={branchLabel}
                      />
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        className="reveal"
                        action={deleteShift.bind(null, s.id)}
                        confirm="Remove?"
                        successMessage="Taken off the rota"
                        aria-label="Take off the rota"
                      >
                        <Trash2Icon />
                      </ActionButton>
                    </li>
                  )
                })}
              </ul>
            )}
            <AddShiftForm
              date={selected}
              employees={employees.filter((e) => e.active).map((e) => ({
                id: e.id,
                name: e.full_name,
                onLeave: dayLeave.some((l) => l.employee_id === e.id),
                defaultMinutes: e.daily_minutes,
                branchId: e.branch_id,
              }))}
              branches={branchOptions}
              branchLabel={branchLabel}
              selectedBranchId={branch?.id ?? null}
            />
          </Panel>

          {selected <= today && (
            <Panel title="Worked">
              {dayWorked.length === 0 ? (
                <EmptyState icon={<UsersIcon />} title="Nobody clocked in" compact />
              ) : (
                <ul className="grid gap-3">
                  {dayWorked.map((s) => {
                    const e = byId.get(s.employee_id)
                    return (
                      <li key={s.employee_id} className="grid gap-1.5">
                        <div className="flex items-center gap-2.5 text-sm">
                          <PersonAvatar name={s.full_name} color={s.color} size="sm" status={s.is_clocked_in ? 'in' : undefined} />
                          <span className="flex-1 truncate">{s.full_name}</span>
                          <span className="font-medium tabular-nums">{formatDuration(s.worked_seconds)}</span>
                        </div>
                        <HoursBar
                          className="ml-9.5 w-auto"
                          workedMinutes={s.worked_seconds / 60}
                          targetMinutes={s.approved_minutes ?? e?.daily_minutes ?? null}
                          finished={!s.is_clocked_in}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
              <Button variant="link" size="sm" className="mt-2 px-0" nativeButton={false} render={<Link href={`/attendance?date=${selected}`} />}>
                Open attendance for this day →
              </Button>
            </Panel>
          )}

          {dayLeave.length > 0 && (
            <Panel title="On holiday">
              <ul className="grid gap-2">
                {dayLeave.map((l) => {
                  const e = byId.get(l.employee_id)
                  return e ? (
                    <li key={l.id} className="flex items-center gap-2.5 text-sm">
                      <PersonAvatar name={e.full_name} color={e.color} size="sm" />
                      <span className="flex-1">{e.full_name}</span>
                      <span className="tone-amber rounded-full px-2 py-0.5 text-xs font-medium capitalize">{l.leave_type}</span>
                    </li>
                  ) : null
                })}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
