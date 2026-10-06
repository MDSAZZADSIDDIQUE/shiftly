'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/format'

/** A ticking "5h 12m 13s" counter: `baseSeconds` already worked plus time since `since`. */
export function LiveDuration({
  since,
  baseSeconds = 0,
  serverNow,
}: {
  since: string | null
  baseSeconds?: number
  /** Render time on the server, so the first paint matches hydration. */
  serverNow: number
}) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])

  const extra = since ? Math.max(0, (now - new Date(since).getTime()) / 1000) : 0
  return <span className="tabular-nums">{formatDuration(baseSeconds + extra)}</span>
}

/** Re-renders the page whenever a punch lands or a session changes. */
export function LiveRefresh() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    let pending = false
    const refresh = () => {
      // A background tab can't animate and nobody is looking: catch up when it's visible again.
      if (document.hidden) {
        pending = true
        return
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 400)
    }
    const onVisible = () => {
      if (!document.hidden && pending) {
        pending = false
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // Row level security applies to realtime too, so the socket must carry the manager's token.
    supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channel = supabase
        .channel('attendance-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, refresh)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'punches' }, refresh)
        .subscribe((state, error) => {
          if (state === 'SUBSCRIBED') setStatus('live')
          else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            setStatus('offline')
            if (error) console.warn('[live] realtime channel error', error)
          }
        })
    })

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (timer.current) clearTimeout(timer.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [router])

  const styles = {
    live: ['tone-emerald', 'bg-success', 'Live'],
    connecting: ['tone-zinc', 'bg-idle', 'Connecting…'],
    offline: ['tone-amber', 'bg-warning', 'Offline · refresh to update'],
  } as const
  const [tone, dot, label] = styles[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`} title={label}>
      <span className="relative flex size-2">
        {status === 'live' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  )
}
