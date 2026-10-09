import type { Metadata } from 'next'
import Link from 'next/link'
import { ViewTransition, type CSSProperties } from 'react'
import { FingerprintIcon, UserPlusIcon } from 'lucide-react'
import { EmptyState, PageHeader, PersonAvatar } from '@/components/people'
import { createEmployee } from '@/lib/actions/employees'
import { formatMinutes, formatPence, londonToday, shiftDate } from '@/lib/format'
import { capitalise, getBranches, getSelectedBranch, requireBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import type { DailySummary, Employee, PayRate } from '@/lib/types'
import { AddEmployeeDialog } from './employee-form'

export const metadata: Metadata = { title: 'Staff' }

export default async function EmployeesPage() {
  const business = await requireBusiness()
  const [branches, branch] = await Promise.all([getBranches(business.id), getSelectedBranch(business.id)])
  const branchChoice = {
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    label: capitalise(business.branch_word),
    defaultId: branch?.id ?? null,
  }
  const today = londonToday()
  const monthStart = `${today.slice(0, 7)}-01`
  const supabase = await createClient()
  const [employeesRes, ratesRes, monthRes] = await Promise.all([
    supabase.from('employees').select('*').order('active', { ascending: false }).order('full_name'),
    supabase.from('pay_rates').select('*').lte('effective_from', today).order('effective_from', { ascending: false }),
    supabase.from('daily_summary').select('employee_id, paid_minutes, worked_seconds, is_clocked_in, work_date').gte('work_date', monthStart < shiftDate(today, -13) ? monthStart : shiftDate(today, -13)),
  ])

  // At one branch: the people based there.
  const employees = ((employeesRes.data ?? []) as Employee[]).filter((e) => !branch || e.branch_id === branch.id)
  const rates = (ratesRes.data ?? []) as PayRate[]
  const month = (monthRes.data ?? []) as Pick<DailySummary, 'employee_id' | 'paid_minutes' | 'worked_seconds' | 'is_clocked_in' | 'work_date'>[]

  return (
    <>
      <PageHeader
        title="Staff"
        description={`${employees.filter((e) => e.active).length} on the books${branch ? ` at ${branch.name}` : ''}`}
        actions={<AddEmployeeDialog action={createEmployee} branch={branchChoice} />}
      />
      {employees.length === 0 ? (
        <div className="surface rounded-2xl">
          <EmptyState icon={<UserPlusIcon />} title="No staff yet" action={<AddEmployeeDialog action={createEmployee} branch={branchChoice} />}>
            Add your first employee, then enrol their fingerprint on the terminal to start tracking hours.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => {
            const rate = rates.find((r) => r.employee_id === e.id)
            const mine = month.filter((d) => d.employee_id === e.id)
            const paid = mine.filter((d) => d.work_date >= monthStart).reduce((sum, d) => sum + d.paid_minutes, 0)
            const last14 = Array.from({ length: 14 }, (_, i) => {
              const day = shiftDate(today, i - 13)
              return mine.find((d) => d.work_date === day)?.worked_seconds ?? 0
            })
            const isIn = mine.some((d) => d.work_date === today && d.is_clocked_in)
            return (
              <Link
                key={e.id}
                href={`/employees/${e.id}`}
                className="rise-in hoverable group surface relative flex flex-col gap-4 overflow-hidden rounded-2xl p-5 data-[inactive=true]:opacity-60"
                data-inactive={!e.active}
              >
                <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: e.color }} />
                <div className="flex items-center gap-3">
                  {/* Same name as the profile header avatar, so it flies there on navigation. */}
                  <ViewTransition name={`avatar-${e.id}`} share="morph" default="none">
                    <span className="inline-flex transition-transform duration-300 group-hover:scale-105">
                      <PersonAvatar name={e.full_name} color={e.color} size="lg" status={isIn ? 'in' : undefined} />
                    </span>
                  </ViewTransition>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold group-hover:text-primary">{e.full_name}</p>
                    <p className="truncate text-sm text-muted-foreground">{e.job_title ?? 'Team member'}</p>
                  </div>
                  {!e.active && <span className="tone-zinc rounded-full px-2 py-0.5 text-xs font-medium">Left</span>}
                  {e.active && !e.device_user_id && (
                    <span className="tone-amber inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" title="No fingerprint user ID set">
                      <FingerprintIcon className="size-3" /> Not enrolled
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex h-9 items-end gap-[3px]" aria-label="Hours worked, last 14 days">
                    {last14.map((s, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: s > 0 ? `${Math.max(12, (s / Math.max(...last14, 1)) * 100)}%` : '3px',
                          // Older days fade toward the card colour (less so in dark mode, see --history-fade).
                          backgroundColor: s > 0 ? `color-mix(in oklch, ${e.color} calc(100% - var(--history-fade) * ${((13 - i) / 13).toFixed(3)}), var(--card))` : 'var(--muted)',
                          } as CSSProperties}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">Last 14 days</p>
                </div>
                <dl className="grid grid-cols-3 gap-2 border-t pt-4 text-center">
                  <div>
                    <dt className="text-[0.7rem] text-muted-foreground">Usual day</dt>
                    <dd className="text-sm font-semibold">{formatMinutes(e.daily_minutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] text-muted-foreground">Rate</dt>
                    <dd className="text-sm font-semibold">{rate ? `${formatPence(rate.hourly_rate_pence)}/h` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] text-muted-foreground">This month</dt>
                    <dd className="text-sm font-semibold">{formatMinutes(paid)}</dd>
                  </div>
                </dl>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
