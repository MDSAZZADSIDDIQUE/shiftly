import { TZDate } from '@date-fns/tz'
import { addDays, format, parseISO } from 'date-fns'

export const TZ = 'Europe/London'

/** Request time for server components (rendered once per request). */
export function requestTime() {
  return Date.now()
}

/** 18733 -> "5h 12m 13s" */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`
}

/** 300 -> "5h", 270 -> "4h 30m" */
export function formatMinutes(totalMinutes: number | null | undefined) {
  if (totalMinutes == null) return '—'
  const m = Math.round(totalMinutes)
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  return rest === 0 ? `${h}h` : `${h}h ${rest.toString().padStart(2, '0')}m`
}

/** Decimal hours, e.g. 270 -> 4.5 */
export function minutesToHours(totalMinutes: number) {
  return Math.round((totalMinutes / 60) * 100) / 100
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export function formatPence(pence: number | null | undefined) {
  if (pence == null) return '—'
  return gbp.format(pence / 100)
}

/** Today's date (yyyy-MM-dd) in London. */
export function londonToday() {
  return format(new TZDate(Date.now(), TZ), 'yyyy-MM-dd')
}

/** London calendar date (yyyy-MM-dd) for an ISO instant. */
export function londonDate(iso: string) {
  return format(new TZDate(iso, TZ), 'yyyy-MM-dd')
}

/** London wall-clock time (HH:mm) for an ISO instant. */
export function londonTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return format(new TZDate(iso, TZ), 'HH:mm')
}

export function londonTimeSeconds(iso: string | null | undefined) {
  if (!iso) return '—'
  return format(new TZDate(iso, TZ), 'HH:mm:ss')
}

/** "2026-10-06" + "09:30" (London) -> ISO instant in UTC. */
export function londonToIso(date: string, time: string) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new TZDate(y, mo - 1, d, h, mi, 0, TZ).toISOString()
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function shiftDate(date: string, days: number) {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

export function prettyDate(date: string, pattern = 'EEE d MMM yyyy') {
  return format(parseISO(date), pattern)
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
