import type { Metadata } from 'next'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CalendarHeartIcon, CheckIcon, InboxIcon, PalmtreeIcon, XIcon } from 'lucide-react'
import { ActionButton } from '@/components/forms'
import { EmptyState, PageHeader, Panel, PersonAvatar } from '@/components/people'
import { createLeave, decideLeave } from '@/lib/actions/schedule'
import { londonToday, prettyDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { Employee, LeaveRequest } from '@/lib/types'
import { BookLeaveDialog } from './book-leave-dialog'

export const metadata: Metadata = { title: 'Holidays' }

const TYPE_STYLE: Record<LeaveRequest['leave_type'], string> = {
  annual: 'tone-amber',
  sick: 'tone-rose',
  unpaid: 'tone-zinc',
  other: 'tone-sky',
}

function days(l: LeaveRequest) {
  return differenceInCalendarDays(parseISO(l.end_date), parseISO(l.start_date)) + 1
}

export default async function LeavePage() {
  const today = londonToday()
  const year = today.slice(0, 4)
  const supabase = await createClient()
  const [employeesRes, leaveRes] = await Promise.all([
    supabase.from('employees').select('*').order('full_name'),
    supabase.from('leave_requests').select('*').order('start_date', { ascending: false }).limit(300),
  ])
  const employees = (employeesRes.data ?? []) as Employee[]
  const leave = (leaveRes.data ?? []) as LeaveRequest[]
  const byId = new Map(employees.map((e) => [e.id, e]))

  const pending = leave.filter((l) => l.status === 'pending')
  const upcoming = leave.filter((l) => l.status === 'approved' && l.end_date >= today).reverse()
  const past = leave.filter((l) => l.status !== 'pending' && !(l.status === 'approved' && l.end_date >= today))

  const takenThisYear = (employeeId: string) =>
    leave
      .filter((l) => l.employee_id === employeeId && l.status === 'approved' && l.leave_type === 'annual' && l.start_date.startsWith(year))
      .reduce((sum, l) => sum + days(l), 0)

  const row = (l: LeaveRequest, actions?: React.ReactNode) => {
    const e = byId.get(l.employee_id)
    if (!e) return null
    return (
      <li key={l.id} className="rise-in hoverable group/row flex flex-wrap items-center gap-3 rounded-xl bg-muted/45 p-3" style={{ borderLeft: `3px solid ${e.color}` }}>
        <DateBadge date={l.start_date} />
        <PersonAvatar name={e.full_name} color={e.color} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{e.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {prettyDate(l.start_date, 'EEE d MMM')}
            {l.end_date !== l.start_date && ` → ${prettyDate(l.end_date, 'EEE d MMM')}`} · {days(l)} day{days(l) === 1 ? '' : 's'}
            {l.note && ` · ${l.note}`}
          </p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', TYPE_STYLE[l.leave_type])}>{l.leave_type}</span>
        {actions ?? (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', l.status === 'approved' ? 'tone-emerald' : 'tone-zinc')}>{l.status}</span>
        )}
      </li>
    )
  }

  return (
    <>
      <PageHeader
        title="Holidays"
        description="Book time off for your team and approve requests."
        actions={<BookLeaveDialog action={createLeave} employees={employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.full_name }))} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Panel
            title={
              <span className="flex items-center gap-2">
                Waiting for approval
                {pending.length > 0 && <span className="tone-amber rounded-full px-1.5 py-px text-[0.7rem] font-semibold">{pending.length}</span>}
              </span>
            }
            className={cn(pending.length > 0 && 'ring-1 ring-warning/40')}
          >
            {pending.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title="All caught up" compact>Requests from the employee app will appear here.</EmptyState>
            ) : (
              <ul className="grid gap-2">
                {pending.map((l) =>
                  row(
                    l,
                    <div className="flex gap-1">
                      <ActionButton size="sm" action={decideLeave.bind(null, l.id, 'approved')} successMessage="Approved">
                        <CheckIcon /> Approve
                      </ActionButton>
                      <ActionButton size="sm" variant="outline" action={decideLeave.bind(null, l.id, 'declined')} successMessage="Declined">
                        <XIcon /> Decline
                      </ActionButton>
                    </div>
                  )
                )}
              </ul>
            )}
          </Panel>

          <Panel title="Upcoming & current">
            {upcoming.length === 0 ? (
              <EmptyState icon={<CalendarHeartIcon />} title="No holidays booked" compact>Book time off with the button above.</EmptyState>
            ) : (
              <ul className="grid gap-2">
                {upcoming.map((l) =>
                  row(
                    l,
                    <ActionButton size="sm" variant="ghost" action={decideLeave.bind(null, l.id, 'cancelled')} confirm="Tap again to cancel" successMessage="Cancelled">
                      Cancel
                    </ActionButton>
                  )
                )}
              </ul>
            )}
          </Panel>

          {past.length > 0 && (
            <Panel title="History">
              <ul className="grid gap-2">{past.slice(0, 30).map((l) => row(l))}</ul>
            </Panel>
          )}
        </div>

        <Panel
          title={<span className="flex items-center gap-2"><PalmtreeIcon className="size-4 text-warning-text" />Annual leave taken in {year}</span>}
          info="Bar shows days against 28 (5.6 weeks for full-time staff)"
          className="h-fit"
        >
          <ul className="grid gap-3">
            {employees
              .filter((e) => e.active)
              .map((e) => {
                const taken = takenThisYear(e.id)
                return (
                  <li key={e.id} className="flex items-center gap-2.5 text-sm">
                    <PersonAvatar name={e.full_name} color={e.color} size="sm" />
                    <span className="flex-1 truncate">{e.full_name}</span>
                    <span className="flex w-28 items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-warning" style={{ width: `${Math.min(100, (taken / 28) * 100)}%` }} />
                      </span>
                      <span className="w-12 text-right text-xs font-medium tabular-nums">{taken} day{taken === 1 ? '' : 's'}</span>
                    </span>
                  </li>
                )
              })}
          </ul>
        </Panel>
      </div>
    </>
  )
}

function DateBadge({ date }: { date: string }) {
  return (
    <span className="flex w-11 shrink-0 flex-col items-center overflow-hidden rounded-lg border bg-card text-center leading-none shadow-xs">
      <span className="w-full bg-foreground py-0.5 text-[0.6rem] font-semibold tracking-wide text-background uppercase">{prettyDate(date, 'MMM')}</span>
      <span className="py-1 text-base font-semibold tabular-nums">{prettyDate(date, 'd')}</span>
    </span>
  )
}
