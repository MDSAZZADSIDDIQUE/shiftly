import { differenceInCalendarDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from 'date-fns'
import { isDateString } from '@/lib/format'

export type Period = { from: string; to: string }

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

export function presets(today: string) {
  const t = parseISO(today)
  const lastMonth = subMonths(t, 1)
  const lastWeek = subWeeks(t, 1)
  return [
    { label: 'This month', from: fmt(startOfMonth(t)), to: fmt(endOfMonth(t)) },
    { label: 'Last month', from: fmt(startOfMonth(lastMonth)), to: fmt(endOfMonth(lastMonth)) },
    { label: 'This week', from: fmt(startOfWeek(t, { weekStartsOn: 1 })), to: fmt(endOfWeek(t, { weekStartsOn: 1 })) },
    { label: 'Last week', from: fmt(startOfWeek(lastWeek, { weekStartsOn: 1 })), to: fmt(endOfWeek(lastWeek, { weekStartsOn: 1 })) },
  ]
}

export function periodFrom(params: Record<string, string | string[] | undefined>, today: string): Period {
  const from = params.from
  const to = params.to
  if (isDateString(from) && isDateString(to) && from <= to) return { from, to }
  return presets(today)[0]
}

/** The period just before this one: the previous calendar month for whole months, otherwise the same number of days. */
export function previousPeriod({ from, to }: Period): Period {
  const f = parseISO(from)
  const t = parseISO(to)
  if (fmt(startOfMonth(f)) === from && fmt(endOfMonth(t)) === to) {
    const months = (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1
    const start = subMonths(f, months)
    return { from: fmt(start), to: fmt(endOfMonth(subMonths(t, months))) }
  }
  const days = differenceInCalendarDays(t, f) + 1
  return { from: fmt(subDays(f, days)), to: fmt(subDays(f, 1)) }
}
