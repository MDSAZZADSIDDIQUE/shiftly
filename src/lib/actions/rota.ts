'use server'

import { revalidatePath } from 'next/cache'
import { differenceInCalendarDays, getISODay, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { isDateString, londonTime, londonToIso, londonToday, shiftDate } from '@/lib/format'
import type { ActionResult, ShiftPattern, Shift } from '@/lib/types'
import { done, str } from './helpers'

const TIME = /^\d{2}:\d{2}$/
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Guard against filling a whole year by accident. */
const MAX_DAYS = 62

/** What a bulk change did, plus the new shift ids so it can be undone. */
export type BulkResult = ActionResult & { message?: string; created?: string[] }

type Supabase = Awaited<ReturnType<typeof createClient>>

/** A shift to add, in UK local time. An end at or before the start runs past midnight. */
type Candidate = { employee_id: string; date: string; start: string; end: string; note: string | null }

/**
 * Adds many shifts at once. Skips anything in the past, anyone on approved holiday that day,
 * and anything that would overlap a shift they already have (or another one being added).
 */
async function addShifts(supabase: Supabase, candidates: Candidate[]): Promise<BulkResult> {
  const now = Date.now()
  const rows = candidates
    .map((c) => ({
      ...c,
      starts_at: londonToIso(c.date, c.start),
      ends_at: londonToIso(c.end <= c.start ? shiftDate(c.date, 1) : c.date, c.end),
    }))
    .filter((r) => new Date(r.starts_at).getTime() > now)
  if (rows.length === 0) return { ok: true, message: 'Nothing to add: those days are already over.', created: [] }

  const dates = rows.map((r) => r.date).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  const employeeIds = [...new Set(rows.map((r) => r.employee_id))]
  const [existingRes, leaveRes] = await Promise.all([
    supabase
      .from('shifts')
      .select('employee_id, starts_at, ends_at')
      .in('employee_id', employeeIds)
      .gte('shift_date', shiftDate(from, -1))
      .lte('shift_date', shiftDate(to, 1)),
    supabase
      .from('leave_requests')
      .select('employee_id, start_date, end_date')
      .eq('status', 'approved')
      .in('employee_id', employeeIds)
      .lte('start_date', to)
      .gte('end_date', from),
  ])
  if (existingRes.error) return { error: existingRes.error.message }
  if (leaveRes.error) return { error: leaveRes.error.message }

  const taken = new Map<string, [number, number][]>()
  for (const s of existingRes.data as Pick<Shift, 'employee_id' | 'starts_at' | 'ends_at'>[]) {
    taken.set(s.employee_id, [...(taken.get(s.employee_id) ?? []), [new Date(s.starts_at).getTime(), new Date(s.ends_at).getTime()]])
  }
  const leave = leaveRes.data as { employee_id: string; start_date: string; end_date: string }[]

  let holiday = 0
  let clash = 0
  const accepted: typeof rows = []
  for (const r of rows) {
    if (leave.some((l) => l.employee_id === r.employee_id && l.start_date <= r.date && l.end_date >= r.date)) {
      holiday++
      continue
    }
    const a = new Date(r.starts_at).getTime()
    const b = new Date(r.ends_at).getTime()
    const mine = taken.get(r.employee_id) ?? []
    if (mine.some(([s, e]) => a < e && s < b)) {
      clash++
      continue
    }
    mine.push([a, b])
    taken.set(r.employee_id, mine)
    accepted.push(r)
  }

  let created: string[] = []
  if (accepted.length > 0) {
    const { data, error } = await supabase
      .from('shifts')
      .insert(accepted.map((r) => ({ employee_id: r.employee_id, starts_at: r.starts_at, ends_at: r.ends_at, note: r.note })))
      .select('id')
    if (error) return done(error)
    created = (data ?? []).map((d: { id: string }) => d.id)
  }
  revalidatePath('/', 'layout')

  const parts = [`Added ${created.length} shift${created.length === 1 ? '' : 's'}`]
  if (holiday) parts.push(`${holiday} skipped for holidays`)
  if (clash) parts.push(`${clash} already on the rota`)
  return { ok: true, message: parts.join(' · '), created }
}

/** Fill the rota from everyone's usual week (or one person's) for a date range. */
export async function fillRota(form: FormData): Promise<BulkResult> {
  const from = str(form, 'from')
  const to = str(form, 'to')
  const employeeId = str(form, 'employee_id')
  if (!isDateString(from) || !isDateString(to)) return { error: 'Choose the dates to fill.' }
  if (to < from) return { error: 'The end date must be on or after the start date.' }
  if (to < londonToday()) return { error: 'Those dates are already over.' }
  if (differenceInCalendarDays(parseISO(to), parseISO(from)) + 1 > MAX_DAYS) return { error: `Fill up to ${MAX_DAYS} days at a time.` }

  const supabase = await createClient()
  let query = supabase.from('shift_patterns').select('*, employees!inner(active)').eq('employees.active', true)
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query
  if (error) return { error: error.message }
  const patterns = data as ShiftPattern[]
  if (patterns.length === 0) {
    return { error: employeeId ? 'They have no usual week yet. Set one on their profile.' : 'Nobody has a usual week yet. Set one on each staff profile.' }
  }

  const candidates: Candidate[] = []
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const weekday = getISODay(parseISO(date))
    for (const p of patterns) {
      if (p.weekday === weekday) {
        candidates.push({ employee_id: p.employee_id, date, start: p.start_time.slice(0, 5), end: p.end_time.slice(0, 5), note: null })
      }
    }
  }
  return addShifts(supabase, candidates)
}

/** Copy the week starting `week` (a Monday) forward by 1 to 4 weeks. */
export async function copyWeek(form: FormData): Promise<BulkResult> {
  const week = str(form, 'week')
  const times = Number(str(form, 'weeks'))
  if (!isDateString(week) || getISODay(parseISO(week)) !== 1) return { error: 'Choose a week to copy.' }
  if (!Number.isInteger(times) || times < 1 || times > 4) return { error: 'Copy forward 1 to 4 weeks.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shifts')
    .select('*, employees!inner(active)')
    .eq('employees.active', true)
    .gte('shift_date', week)
    .lte('shift_date', shiftDate(week, 6))
  if (error) return { error: error.message }
  const source = data as Shift[]
  if (source.length === 0) return { error: 'That week has no shifts to copy.' }

  const candidates: Candidate[] = []
  for (let k = 1; k <= times; k++) {
    for (const s of source) {
      candidates.push({
        employee_id: s.employee_id,
        date: shiftDate(s.shift_date, 7 * k),
        // Wall-clock times, so a copy across a clock change still starts at 08:00.
        // A shift that ran past midnight comes back the same way (its end is before its start).
        start: londonTime(s.starts_at),
        end: londonTime(s.ends_at),
        note: s.note,
      })
    }
  }
  return addShifts(supabase, candidates)
}

/** Undo a bulk add: removes exactly the shifts it created. */
export async function undoShifts(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return { ok: true }
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').delete().in('id', ids.slice(0, 2000))
  return done(error)
}

/** Replace someone's usual week. Each weekday has an optional start and end time. */
export async function saveUsualWeek(employeeId: string, form: FormData): Promise<ActionResult> {
  const rows: { employee_id: string; weekday: number; start_time: string; end_time: string }[] = []
  for (let weekday = 1; weekday <= 7; weekday++) {
    const start = str(form, `start_${weekday}`)
    const end = str(form, `end_${weekday}`)
    if (!start && !end) continue
    if (!TIME.test(start) || !TIME.test(end)) return { error: `Add a start and end time for ${DAYS[weekday - 1]}, or leave both empty.` }
    if (start === end) return { error: `${DAYS[weekday - 1]} starts and ends at the same time.` }
    rows.push({ employee_id: employeeId, weekday, start_time: start, end_time: end })
  }

  const supabase = await createClient()
  const { error: deleteError } = await supabase.from('shift_patterns').delete().eq('employee_id', employeeId)
  if (deleteError) return done(deleteError)
  if (rows.length === 0) return done(null)
  const { error } = await supabase.from('shift_patterns').insert(rows)
  return done(error)
}
