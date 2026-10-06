'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'
import { isDateString, londonToIso } from '@/lib/format'
import { done, hoursToMinutes, optional, str } from './helpers'

const TIME = /^\d{2}:\d{2}$/

/** Clock someone in or out from the dashboard (no terminal needed — handy for demos and forgotten scans). */
export async function manualPunch(employeeId: string): Promise<ActionResult & { outcome?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('punches')
    .insert({ employee_id: employeeId, punched_at: new Date().toISOString(), source: 'manual' })
    .select('outcome')
    .single()
  if (error) return done(error)
  return { ...done(), outcome: data.outcome ?? undefined }
}

/** Set (or clear) the paid hours for one employee on one day. */
export async function setDayHours(employeeId: string, workDate: string, form: FormData): Promise<ActionResult> {
  if (!isDateString(workDate)) return { error: 'Invalid date.' }
  const minutes = hoursToMinutes(str(form, 'hours'))
  if (minutes === 'invalid') return { error: 'Hours must be between 0 and 24, e.g. 5 or 4:30.' }

  const supabase = await createClient()
  if (minutes === null) {
    const { error } = await supabase
      .from('day_approvals')
      .delete()
      .eq('employee_id', employeeId)
      .eq('work_date', workDate)
    return done(error)
  }

  const { data: claims } = await supabase.auth.getClaims()
  const { error } = await supabase.from('day_approvals').upsert({
    employee_id: employeeId,
    work_date: workDate,
    approved_minutes: minutes,
    note: optional(form, 'note'),
    approved_by: claims?.claims.sub ?? null,
    updated_at: new Date().toISOString(),
  })
  return done(error)
}

function sessionTimes(form: FormData) {
  const date = str(form, 'date')
  const clockIn = str(form, 'clock_in')
  const clockOut = str(form, 'clock_out')
  if (!isDateString(date) || !TIME.test(clockIn)) return { error: 'Enter a date and clock in time.' } as const
  if (clockOut && !TIME.test(clockOut)) return { error: 'Clock out time is invalid.' } as const

  const inIso = londonToIso(date, clockIn)
  let outIso: string | null = null
  if (clockOut) {
    // A clock out earlier than the clock in means the shift ran past midnight.
    const outDate = clockOut <= clockIn ? nextDay(date) : date
    outIso = londonToIso(outDate, clockOut)
  }
  return { values: { clock_in: inIso, clock_out: outIso, note: optional(form, 'note') } } as const
}

function nextDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function addSession(employeeId: string, form: FormData): Promise<ActionResult> {
  const parsed = sessionTimes(form)
  if ('error' in parsed) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('attendance_sessions')
    .insert({ employee_id: employeeId, ...parsed.values, edited: true })
  return done(error)
}

export async function updateSession(id: string, form: FormData): Promise<ActionResult> {
  const parsed = sessionTimes(form)
  if ('error' in parsed) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_sessions').update(parsed.values).eq('id', id)
  return done(error)
}

export async function deleteSession(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_sessions').delete().eq('id', id)
  return done(error)
}
