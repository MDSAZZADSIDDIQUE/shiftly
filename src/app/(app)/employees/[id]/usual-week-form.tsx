'use client'

import { useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMinutes } from '@/lib/format'
import type { ActionResult, ShiftPattern } from '@/lib/types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Slot = { start: string; end: string }

function length({ start, end }: Slot) {
  if (!start || !end || start === end) return 0
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const minutes = toMin(end) - toMin(start)
  return minutes > 0 ? minutes : minutes + 24 * 60
}

/** Start and end times for each weekday. Empty means not working that day. */
export function UsualWeekForm({ patterns, action }: { patterns: ShiftPattern[]; action: (form: FormData) => Promise<ActionResult> }) {
  const [week, setWeek] = useState<Slot[]>(() =>
    DAYS.map((_, i) => {
      const p = patterns.find((x) => x.weekday === i + 1)
      return { start: p?.start_time.slice(0, 5) ?? '', end: p?.end_time.slice(0, 5) ?? '' }
    })
  )
  const set = (i: number, key: keyof Slot, value: string) => setWeek((w) => w.map((s, j) => (j === i ? { ...s, [key]: value } : s)))
  const total = week.reduce((sum, s) => sum + length(s), 0)
  const days = week.filter((s) => length(s) > 0).length

  return (
    <ActionForm action={action} successMessage="Usual week saved" className="grid gap-3">
      <ul className="grid gap-1.5">
        {DAYS.map((day, i) => {
          const slot = week[i]
          const minutes = length(slot)
          return (
            <li key={day} className="grid grid-cols-[2.5rem_1fr_auto_1fr_3.25rem] items-center gap-1.5">
              <span className={minutes ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>{day}</span>
              <Input type="time" step={900} name={`start_${i + 1}`} value={slot.start} onChange={(e) => set(i, 'start', e.target.value)} aria-label={`${day} start`} className="px-1.5" />
              <span className="text-muted-foreground">–</span>
              <Input type="time" step={900} name={`end_${i + 1}`} value={slot.end} onChange={(e) => set(i, 'end', e.target.value)} aria-label={`${day} end`} className="px-1.5" />
              <span className="text-right text-xs text-muted-foreground tabular-nums">{minutes ? formatMinutes(minutes) : 'off'}</span>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="font-medium tabular-nums">{formatMinutes(total)}</span>
          <span className="text-muted-foreground"> a week · {days} day{days === 1 ? '' : 's'}</span>
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!week[0].start || !week[0].end}
            onClick={() => setWeek((w) => w.map((s, j) => (j >= 1 && j <= 4 ? { ...w[0] } : s)))}
            title="Copy Monday's times to Tuesday to Friday"
          >
            <CopyIcon /> Mon to Tue–Fri
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => setWeek(DAYS.map(() => ({ start: '', end: '' })))}>
            Clear
          </Button>
        </span>
      </div>
      <SubmitButton size="sm" className="justify-self-start">Save usual week</SubmitButton>
    </ActionForm>
  )
}
