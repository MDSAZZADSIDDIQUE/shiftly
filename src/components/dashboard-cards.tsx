'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { EllipsisIcon, LogInIcon, LogOutIcon, UserIcon } from 'lucide-react'
import { Measure } from '@/components/measure'
import { PersonAvatar } from '@/components/people'
import { Ring } from '@/components/visuals'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatDuration, formatMinutes } from '@/lib/format'
import type { ActionResult } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Manual clock in / out lives in a menu: it's the fallback for a forgotten scan, not the main action. */
export function PunchMenu({
  employeeId,
  name,
  clockedIn,
  action,
}: {
  employeeId: string
  name: string
  clockedIn: boolean
  action: () => Promise<ActionResult & { outcome?: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} disabled={pending} />}
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() =>
            startTransition(async () => {
              const result = await action()
              if (result.error) toast.error(result.error)
              else toast.success(result.outcome === 'out' ? `${name} clocked out` : `${name} clocked in`)
            })
          }
        >
          {clockedIn ? <LogOutIcon /> : <LogInIcon />}
          {clockedIn ? 'Clock out manually' : 'Clock in manually'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/employees/${employeeId}`)}>
          <UserIcon /> View profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Someone currently at work: a live ring fills toward the hours set for their day. */
export function WorkingCard({
  employeeId,
  name,
  color,
  since,
  sinceLabel,
  closedSeconds,
  targetMinutes,
  serverNow,
  action,
}: {
  employeeId: string
  name: string
  color: string
  since: string
  sinceLabel: string
  closedSeconds: number
  targetMinutes: number | null
  serverNow: number
  action: () => Promise<ActionResult & { outcome?: string }>
}) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const seconds = closedSeconds + Math.max(0, (now - new Date(since).getTime()) / 1000)
  const minutes = seconds / 60
  const ratio = targetMinutes ? minutes / targetMinutes : 0
  const tone = !targetMinutes ? 'none' : ratio > 1 ? 'over' : ratio >= 0.9 ? 'almost' : 'ok'
  const ringColor = { none: 'var(--idle)', ok: 'var(--success)', almost: 'var(--warning)', over: 'var(--overtime)' }[tone]

  return (
    <div
      className="rise-in hoverable flex items-center gap-3 rounded-xl bg-success/[0.07] p-3"
    >
      <Ring value={minutes} max={targetMinutes ?? minutes} size={52} stroke={4} color={ringColor} className="breathe">
        <PersonAvatar name={name} color={color} />
      </Ring>
      <div className="min-w-0 flex-1">
        <Link href={`/employees/${employeeId}`} className="block truncate text-sm font-semibold hover:underline">
          {name}
        </Link>
        <p className="font-display text-xl leading-tight font-light tracking-tight tabular-nums"><Measure>{formatDuration(seconds)}</Measure></p>
        <p className="truncate text-xs text-muted-foreground">
          In since {sinceLabel}
          {targetMinutes ? (
            <>
              {' · '}
              <span className={cn(tone === 'over' && 'font-medium text-overtime-text', tone === 'almost' && 'font-medium text-warning-text')}>
                {tone === 'over'
                  ? `+${formatMinutes(Math.floor(minutes - targetMinutes))} over ${formatMinutes(targetMinutes)}`
                  : `${formatMinutes(Math.ceil(targetMinutes - minutes))} left of ${formatMinutes(targetMinutes)}`}
              </span>
            </>
          ) : (
            ' · no set hours'
          )}
        </p>
      </div>
      <PunchMenu employeeId={employeeId} name={name} clockedIn action={action} />
    </div>
  )
}
