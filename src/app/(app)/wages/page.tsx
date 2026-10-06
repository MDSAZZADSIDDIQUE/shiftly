import type { Metadata } from 'next'
import Link from 'next/link'
import { differenceInCalendarDays, format, parseISO, addDays } from 'date-fns'
import { AlertTriangleIcon, ClockIcon, DownloadIcon, PoundSterlingIcon, TimerIcon, UsersIcon } from 'lucide-react'
import { WagesChart } from '@/components/charts'
import { CountUp } from '@/components/count-up'
import { EmptyState, PageHeader, Panel, PersonAvatar, StatCard } from '@/components/people'
import { Delta } from '@/components/visuals'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/date-field'
import { Ridges } from '@/components/ridges'
import { formatDuration, formatMinutes, formatPence, londonToday, prettyDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { WageRow } from '@/lib/types'
import { periodFrom, presets, previousPeriod } from '@/lib/wages'

export const metadata: Metadata = { title: 'Wages' }

function normalise(rows: WageRow[] | null) {
  return (rows ?? []).map((r) => ({
    ...r,
    worked_seconds: Number(r.worked_seconds),
    paid_minutes: Number(r.paid_minutes),
    gross_pence: Number(r.gross_pence),
  }))
}

function totalsOf(rows: ReturnType<typeof normalise>) {
  return rows.reduce(
    (t, r) => ({ worked: t.worked + r.worked_seconds, paid: t.paid + r.paid_minutes, gross: t.gross + r.gross_pence }),
    { worked: 0, paid: 0, gross: 0 }
  )
}

export default async function WagesPage({ searchParams }: PageProps<'/wages'>) {
  const params = await searchParams
  const today = londonToday()
  const { from, to } = periodFrom(params, today)

  // A period still in progress is compared with the same number of days of the previous one.
  const prev = previousPeriod({ from, to })
  const inProgress = from <= today && to > today
  const elapsed = differenceInCalendarDays(parseISO(today), parseISO(from))
  const prevTo = inProgress ? format(addDays(parseISO(prev.from), elapsed), 'yyyy-MM-dd') : prev.to

  const supabase = await createClient()
  const [{ data, error }, prevRes, prevPartialRes] = await Promise.all([
    supabase.rpc('wage_report', { p_from: from, p_to: to }),
    supabase.rpc('wage_report', { p_from: prev.from, p_to: prev.to }),
    inProgress ? supabase.rpc('wage_report', { p_from: prev.from, p_to: prevTo }) : Promise.resolve({ data: null }),
  ])
  const rows = normalise(data as WageRow[] | null)
  const totals = totalsOf(rows)
  const prevTotals = totalsOf(normalise((inProgress ? prevPartialRes.data : prevRes.data) as WageRow[] | null))
  const compareLabel = inProgress ? 'vs same point last period' : 'vs previous period'
  const missingRates = rows.filter((r) => r.days_without_rate > 0)
  const paidRows = rows.filter((r) => r.gross_pence > 0).sort((a, b) => b.gross_pence - a.gross_pence)

  return (
    <>
      <PageHeader
        title="Wages"
        description="Gross, before tax and NI"
        actions={
          <Button variant="outline" nativeButton={false} render={<a href={`/wages/export?from=${from}&to=${to}`} />}>
            <DownloadIcon /> Export CSV
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="surface flex flex-wrap gap-1 rounded-xl p-1">
          {presets(today).map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={p.from === from && p.to === to ? 'default' : 'ghost'}
              nativeButton={false}
              render={<Link href={`/wages?from=${p.from}&to=${p.to}`} />}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <form action="/wages" className="flex items-center gap-1.5">
          <DateField name="from" defaultValue={from} max={to} label="From" />
          <span className="text-muted-foreground">→</span>
          <DateField name="to" defaultValue={to} min={from} label="To" />
          <button type="submit" className="sr-only">Apply</button>
        </form>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error.message}</p>}

      {/* Headline summary */}
      <section className="rise-in relative mb-6 overflow-hidden rounded-2xl bg-ink p-5 text-ink-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] sm:p-7">
        <Ridges className="absolute -top-40 -right-24 size-[34rem] text-brass-bright/15" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow text-ink-muted!">
              {prettyDate(from, 'd MMM')} – {prettyDate(to, 'd MMM yyyy')}
              {inProgress && ' · in progress'}
            </p>
            <p className="mt-3 font-display text-5xl font-light tracking-tight sm:text-6xl [&_.unit]:text-brass-bright">
              <CountUp value={totals.gross} format="pence" />
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span>{formatMinutes(totals.paid)} paid</span>
              <span>·</span>
              <span>{paidRows.length} staff</span>
              {prevTotals.gross > 0 && (
                <span className="rounded-full bg-brass-bright/15 px-2 py-0.5 text-xs font-semibold text-brass-bright">
                  {totals.gross >= prevTotals.gross ? '↑' : '↓'} {Math.abs(Math.round(((totals.gross - prevTotals.gross) / prevTotals.gross) * 100))}% {compareLabel}
                </span>
              )}
            </p>
          </div>
          {totals.gross > 0 && (
            <div className="w-full lg:max-w-md">
              <div className="flex h-3 overflow-hidden rounded-full bg-white/15">
                {paidRows.map((r) => (
                  <span
                    key={r.employee_id}
                    title={`${r.full_name}: ${formatPence(r.gross_pence)}`}
                    style={{ width: `${(r.gross_pence / totals.gross) * 100}%`, backgroundColor: r.color }}
                    className="border-r border-ink/60 last:border-0"
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                {paidRows.map((r) => (
                  <span key={r.employee_id} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full ring-1 ring-white/50" style={{ backgroundColor: r.color }} />
                    {r.full_name.split(' ')[0]} {Math.round((r.gross_pence / totals.gross) * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Paid hours"
          icon={<ClockIcon />}
          value={<CountUp value={totals.paid} format="minutes" />}
          hint={<Delta current={totals.paid} previous={prevTotals.paid} suffix={compareLabel} />}
        />
        <StatCard
          label="On the clock"
          icon={<TimerIcon />}
          value={<CountUp value={Math.floor(totals.worked / 60)} format="minutes" />}
          hint={unpaidHint(Math.floor(totals.worked / 60) - totals.paid)}
         
        />
        <StatCard
          label="Per paid hour"
          icon={<PoundSterlingIcon />}
          value={totals.paid > 0 ? formatPence(Math.round((totals.gross / totals.paid) * 60)) : '—'}
          hint={`${rows.filter((r) => r.paid_minutes > 0).length} employees paid`}
         
        />
      </div>

      {missingRates.length > 0 && (
        <div className="tone-amber mt-4 flex items-start gap-2 rounded-xl p-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            No hourly rate for some days worked by{' '}
            {missingRates.map((r, i) => (
              <span key={r.employee_id}>
                {i > 0 && ', '}
                <Link className="font-medium underline" href={`/employees/${r.employee_id}`}>{r.full_name}</Link>
              </span>
            ))}
            . Those days count as £0 until you add a rate.
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_400px]">
        <Panel title="By person" className="min-w-0" bodyClassName="p-0 sm:px-0">
          {rows.length === 0 ? (
            <EmptyState icon={<UsersIcon />} title="No staff yet" />
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 text-right font-medium">Days</th>
                      <th className="px-3 py-2 text-right font-medium">Worked</th>
                      <th className="px-3 py-2 text-right font-medium">Paid hours</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-5 py-2 text-right font-medium">Gross pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.employee_id}
                        className={cn('rise-in border-b transition-colors hover:bg-muted/30', r.paid_minutes === 0 && 'text-muted-foreground')}
                      >
                        <td className="px-5 py-3">
                          <Link href={`/employees/${r.employee_id}`} className="flex items-center gap-2 font-medium hover:underline">
                            <PersonAvatar name={r.full_name} color={r.color} size="sm" />
                            {r.full_name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.days_worked}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{formatDuration(r.worked_seconds)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatMinutes(r.paid_minutes)}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{r.current_rate_pence != null ? formatPence(r.current_rate_pence) : '—'}</td>
                        <td className="px-5 py-3 text-right text-base font-semibold tabular-nums">{formatPence(r.gross_pence)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 font-semibold">
                      <td className="px-5 py-3">Total</td>
                      <td />
                      <td className="px-3 py-3 text-right tabular-nums">{formatDuration(totals.worked)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMinutes(totals.paid)}</td>
                      <td />
                      <td className="px-5 py-3 text-right text-base tabular-nums">{formatPence(totals.gross)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <ul className="divide-y border-t md:hidden">
                {rows.map((r) => (
                  <li key={r.employee_id} className="rise-in flex items-center gap-3 p-4">
                    <PersonAvatar name={r.full_name} color={r.color} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/employees/${r.employee_id}`} className="block truncate font-medium hover:underline">{r.full_name}</Link>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatMinutes(r.paid_minutes)} paid · {r.days_worked} days
                        {r.current_rate_pence != null && ` · ${formatPence(r.current_rate_pence)}/h`}
                      </p>
                    </div>
                    <span className="text-base font-semibold tabular-nums">{formatPence(r.gross_pence)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between bg-muted/40 p-4 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatPence(totals.gross)}</span>
                </li>
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Split" className="h-fit">
          {paidRows.length === 0 ? (
            <EmptyState icon={<PoundSterlingIcon />} title="No wages in this period" compact />
          ) : (
            <WagesChart data={paidRows.map((r) => ({ name: r.full_name, gross: Math.round(r.gross_pence) / 100, color: r.color }))} />
          )}
        </Panel>
      </div>
    </>
  )
}

/** Explains the gap between time on the clock and time paid. */
function unpaidHint(diffMinutes: number) {
  if (Math.abs(diffMinutes) < 5) return 'Paid for all time worked'
  return diffMinutes > 0
    ? `${formatMinutes(diffMinutes)} on the clock beyond paid hours`
    : `${formatMinutes(-diffMinutes)} paid by your adjustments`
}
