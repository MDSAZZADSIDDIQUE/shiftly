import type { CSSProperties } from 'react'
import { TZDate } from '@date-fns/tz'
import { PersonAvatar } from '@/components/people'
import { cn } from '@/lib/utils'
import { TZ, formatDuration, formatMinutes, londonTime } from '@/lib/format'
import { toMinutes } from '@/lib/store'
import type { AttendanceSession, Employee, Shift } from '@/lib/types'

/** Minutes after London midnight of `date` for an instant (can exceed 1440 for overnight). */
function minuteOfDay(iso: string, date: string) {
  const d = new TZDate(iso, TZ)
  const [y, m, day] = date.split('-').map(Number)
  const midnight = new TZDate(y, m - 1, day, 0, 0, 0, TZ)
  return (d.getTime() - midnight.getTime()) / 60000
}

const HATCH = 'repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in oklch, var(--muted-foreground) 14%, transparent) 5px 6px)'

/** One row per employee: scheduled shift as a dashed outline, worked time as solid bars. */
export function DayTimeline({
  date,
  employees,
  sessions,
  shifts,
  nowIso,
  isToday,
  openHours,
  placeWord,
  size = 'md',
}: {
  date: string
  employees: Employee[]
  sessions: AttendanceSession[]
  shifts: Shift[]
  nowIso: string
  isToday: boolean
  /** Opening hours that day (UK time), or null when closed all day. */
  openHours: { opens: string; closes: string } | null
  /** What the business calls its premises: "shop", "pharmacy"... */
  placeWord: string
  /** `lg` for the dashboard's "today" strip: taller rows. */
  size?: 'md' | 'lg'
}) {
  const NAME_COL = '7.5rem'
  const rows = employees.filter(
    (e) => sessions.some((s) => s.employee_id === e.id) || shifts.some((s) => s.employee_id === e.id)
  )

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nobody on the rota or clocked in.</p>
  }

  // Closed all day: the whole day is shaded.
  const opens = openHours ? toMinutes(openHours.opens) : 12 * 60
  const closes = openHours ? toMinutes(openHours.closes) : 12 * 60
  const points = [
    ...sessions.flatMap((s) => [minuteOfDay(s.clock_in, date), minuteOfDay(s.clock_out ?? nowIso, date)]),
    ...shifts.flatMap((s) => [minuteOfDay(s.starts_at, date), minuteOfDay(s.ends_at, date)]),
  ]
  const start = Math.max(0, Math.min(opens - 60, ...points.map((p) => Math.floor(p / 60) * 60)))
  const end = Math.min(36 * 60, Math.max(closes + 60, ...points.map((p) => Math.ceil(p / 60) * 60)))
  const span = end - start
  const pos = (minute: number) => ((Math.min(Math.max(minute, start), end) - start) / span) * 100
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => start + i * 60)
  const labelEvery = span > 10 * 60 ? 2 : 1
  const nowMinute = minuteOfDay(nowIso, date)
  const showNow = isToday && nowMinute > start && nowMinute < end
  // The "now" tag sits on the hour row; drop any hour label it would cover.
  const underNowTag = (h: number) => showNow && Math.abs(h - nowMinute) < span * 0.09

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="relative min-w-[560px]">
        {/* Hour labels */}
        <div className="grid gap-3" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
          <span />
          <div className="relative h-6 text-[0.68rem] text-muted-foreground tabular-nums">
            {hours.map((h, i) =>
              i % labelEvery === 0 && !underNowTag(h) ? (
                <span
                  key={h}
                  className="absolute top-0"
                  style={{
                    left: `${pos(h)}%`,
                    transform: i === 0 ? 'none' : i === hours.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  {String(Math.floor(h / 60) % 24).padStart(2, '0')}:00
                </span>
              ) : null
            )}
          </div>
        </div>

        <div className="relative grid gap-1.5">
          {rows.map((e) => {
            const mine = sessions.filter((s) => s.employee_id === e.id)
            const shift = shifts.filter((s) => s.employee_id === e.id)
            const worked = mine.reduce(
              (sum, s) => sum + (new Date(s.clock_out ?? nowIso).getTime() - new Date(s.clock_in).getTime()) / 1000,
              0
            )
            return (
              <div key={e.id} className="grid items-center gap-3" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
                <div className="flex min-w-0 items-center gap-2">
                  <PersonAvatar name={e.full_name} color={e.color} size="sm" />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-medium">{e.full_name.split(' ')[0]}</p>
                    <p className="text-[0.68rem] text-muted-foreground tabular-nums">{worked > 0 ? formatMinutes(Math.floor(worked / 60)) : 'scheduled'}</p>
                  </div>
                </div>
                <div className={cn('relative overflow-hidden rounded-lg bg-muted/50', size === 'lg' ? 'h-12' : 'h-10')}>
                  {/* Closed hours */}
                  <span className="absolute inset-y-0 left-0" style={{ width: `${pos(opens)}%`, backgroundImage: HATCH }} />
                  <span className="absolute inset-y-0 right-0" style={{ left: `${pos(closes)}%`, backgroundImage: HATCH }} />
                  {hours.map((h) => (
                    <span key={h} className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${pos(h)}%` }} />
                  ))}
                  {shift.map((s) => {
                    const a = pos(minuteOfDay(s.starts_at, date))
                    const b = pos(minuteOfDay(s.ends_at, date))
                    return (
                      <span
                        key={s.id}
                        title={`Shift ${londonTime(s.starts_at)}–${londonTime(s.ends_at)}`}
                        className="rise-in absolute inset-y-1 rounded-md border-2 border-dashed"
                        style={{ left: `${a}%`, width: `${b - a}%`, borderColor: e.color, backgroundColor: `${e.color}14` }}
                      />
                    )
                  })}
                  {mine.map((s) => {
                    const a = pos(minuteOfDay(s.clock_in, date))
                    const b = pos(minuteOfDay(s.clock_out ?? nowIso, date))
                    const seconds = (new Date(s.clock_out ?? nowIso).getTime() - new Date(s.clock_in).getTime()) / 1000
                    return (
                      <span
                        key={s.id}
                        title={`${londonTime(s.clock_in)}–${s.clock_out ? londonTime(s.clock_out) : 'now'} · ${formatDuration(seconds)}`}
                        className="absolute inset-y-2 flex items-center overflow-hidden rounded-md px-2 text-[0.68rem] font-semibold whitespace-nowrap text-white shadow-sm"
                        style={{
                          left: `${a}%`,
                          width: `${Math.max(b - a, 0.6)}%`,
                          backgroundColor: e.color,
                          backgroundImage: s.clock_out
                            ? undefined
                            : 'repeating-linear-gradient(45deg, transparent 0 6px, rgb(255 255 255 / 0.22) 6px 12px)',
                        } as CSSProperties}
                      >
                        {seconds >= 75 * 60 && formatMinutes(Math.floor(seconds / 60))}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {showNow && (
            <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: `calc(${NAME_COL} + 0.75rem)` }}>
              <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-primary" style={{ left: `${pos(nowMinute)}%` }} />
            </div>
          )}
        </div>

        {showNow && (
          <div className="pointer-events-none absolute top-0 right-0" style={{ left: `calc(${NAME_COL} + 0.75rem)` }}>
            <span
              className="absolute -translate-x-1/2 rounded-full bg-primary px-1.5 py-px text-[0.62rem] font-semibold text-primary-foreground tabular-nums shadow-sm"
              style={{ left: `${pos(nowMinute)}%` }}
            >
              {londonTime(nowIso)}
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" style={{ paddingLeft: `calc(${NAME_COL} + 0.75rem)` }}>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-muted-foreground" /> Worked</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-muted-foreground" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 3px, rgb(255 255 255 / 0.35) 3px 6px)' }} /> Working now
          </span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border-2 border-dashed border-muted-foreground" /> Scheduled</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-muted" style={{ backgroundImage: HATCH }} /> {placeWord.charAt(0).toUpperCase() + placeWord.slice(1)} closed</span>
          {showNow && <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-primary" /> Now</span>}
        </div>
      </div>
    </div>
  )
}
