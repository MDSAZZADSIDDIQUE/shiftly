import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Circular progress. `value / max`, clamped; overflow beyond max is drawn as a second lap. */
export function Ring({
  value,
  max,
  size = 44,
  stroke = 4,
  color = 'var(--primary)',
  track = 'var(--muted)',
  children,
  className,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = max > 0 ? value / max : 0
  const first = Math.min(1, Math.max(0, ratio))
  const over = Math.min(1, Math.max(0, ratio - 1))
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - first)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        {over > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - over)}
            className="text-foreground/45"
          />
        )}
      </svg>
      <span className="relative">{children}</span>
    </span>
  )
}

/** Tiny area chart for stat cards. */
export function Sparkline({
  values,
  className,
  width = 96,
  height = 32,
}: {
  values: number[]
  className?: string
  width?: number
  height?: number
}) {
  const id = useId().replace(/:/g, '')
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const step = width / (values.length - 1)
  const points = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const)
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('overflow-visible text-primary', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="2.5" fill="currentColor" />
    </svg>
  )
}

export type HoursStatus = 'short' | 'on-track' | 'over' | 'none'

export function hoursStatus(workedMinutes: number, targetMinutes: number | null, finished: boolean): HoursStatus {
  if (!targetMinutes) return 'none'
  if (workedMinutes > targetMinutes + 5) return 'over'
  if (finished && workedMinutes < targetMinutes - 5) return 'short'
  return 'on-track'
}

export const STATUS_COLOR: Record<HoursStatus, string> = {
  short: 'var(--warning)',
  'on-track': 'var(--success)',
  over: 'var(--overtime)',
  none: 'var(--idle)',
}

/** Horizontal bar: worked time against the hours set for the day. */
export function HoursBar({
  workedMinutes,
  targetMinutes,
  finished,
  className,
}: {
  workedMinutes: number
  targetMinutes: number | null
  finished: boolean
  className?: string
}) {
  if (!targetMinutes) return null
  const status = hoursStatus(workedMinutes, targetMinutes, finished)
  const scale = Math.max(targetMinutes, workedMinutes)
  const fill = (Math.min(workedMinutes, targetMinutes) / scale) * 100
  const extra = workedMinutes > targetMinutes ? ((workedMinutes - targetMinutes) / scale) * 100 : 0
  const target = (targetMinutes / scale) * 100
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="absolute inset-0">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-700"
          style={{ width: `${fill}%`, backgroundColor: STATUS_COLOR[status] }}
        />
        {extra > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-overtime-text"
            style={{ left: `${fill}%`, width: `${extra}%` }}
          />
        )}
        {extra > 0 && <div className="absolute inset-y-0 w-0.5 bg-background" style={{ left: `${target}%` }} />}
      </div>
    </div>
  )
}

/** Percentage change pill, e.g. "↑ 12%". */
export function Delta({ current, previous, suffix }: { current: number; previous: number; suffix?: string }) {
  if (previous <= 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  const tone = pct > 0 ? 'tone-emerald' : pct < 0 ? 'tone-rose' : 'tone-zinc'
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('rounded-full px-1.5 py-px text-[0.68rem] font-semibold tabular-nums', tone)}>
        {pct > 0 ? '↑' : pct < 0 ? '↓' : '→'} {Math.abs(pct)}%
      </span>
      {suffix && <span>{suffix}</span>}
    </span>
  )
}
