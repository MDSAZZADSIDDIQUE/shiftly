'use client'

import { useEffect, useState } from 'react'
import { Ring } from '@/components/visuals'
import { formatDuration, formatMinutes } from '@/lib/format'

/** Time worked today as a ring filling toward the usual day. Ticks every second while clocked in. */
export function TodayRing({
  since,
  baseSeconds,
  target,
  serverNow,
  color,
}: {
  /** Clock-in time of the open session, or null when not clocked in. */
  since: string | null
  baseSeconds: number
  target: number | null
  serverNow: number
  color: string
}) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])

  const seconds = baseSeconds + (since ? Math.max(0, (now - new Date(since).getTime()) / 1000) : 0)
  const minutes = seconds / 60
  return (
    <Ring value={minutes} max={target ?? Math.max(minutes, 1)} size={176} stroke={11} color={color} className={since ? 'breathe' : undefined}>
      <span className="flex flex-col items-center text-center">
        <span className="font-display text-[1.7rem] leading-none font-light tracking-tight tabular-nums">{formatDuration(seconds)}</span>
        {target != null && (
          <span className="mt-1.5 text-xs text-muted-foreground">
            {minutes < target ? `${formatMinutes(Math.ceil(target - minutes))} to go` : `${formatMinutes(Math.floor(minutes - target))} over`}
          </span>
        )}
      </span>
    </Ring>
  )
}
