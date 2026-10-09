'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult, LeaveStatus, LeaveType } from '@/lib/types'
import { isDateString, londonToIso } from '@/lib/format'
import { done, optional, str } from './helpers'

const TIME = /^\d{2}:\d{2}$/
const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid', 'other']

/** Reads employee, date, start, end and note from a shift form. An end at or before the start runs past midnight. */
function readShift(form: FormData) {
  const employeeId = str(form, 'employee_id')
  const date = str(form, 'date')
  const start = str(form, 'start')
  const end = str(form, 'end')
  if (!employeeId) return { error: 'Choose an employee.' } as const
  if (!isDateString(date) || !TIME.test(start) || !TIME.test(end)) return { error: 'Enter a date, start and end time.' } as const

  const startsAt = londonToIso(date, start)
  let endsAt = londonToIso(date, end)
  if (end <= start) {
    const next = new Date(`${date}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    endsAt = londonToIso(next.toISOString().slice(0, 10), end)
  }
  return {
    row: { employee_id: employeeId, branch_id: optional(form, 'branch_id'), starts_at: startsAt, ends_at: endsAt, note: optional(form, 'note') },
  } as const
}

export async function createShift(form: FormData): Promise<ActionResult> {
  const shift = readShift(form)
  if ('error' in shift) return { error: shift.error }
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').insert(shift.row)
  return done(error)
}

export async function updateShift(id: string, form: FormData): Promise<ActionResult> {
  const shift = readShift(form)
  if ('error' in shift) return { error: shift.error }
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').update(shift.row).eq('id', id)
  return done(error)
}

export async function deleteShift(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').delete().eq('id', id)
  return done(error)
}

export async function createLeave(form: FormData): Promise<ActionResult> {
  const employeeId = str(form, 'employee_id')
  const start = str(form, 'start_date')
  const end = str(form, 'end_date') || start
  const type = str(form, 'leave_type') as LeaveType
  if (!employeeId) return { error: 'Choose an employee.' }
  if (!isDateString(start) || !isDateString(end)) return { error: 'Choose the dates.' }
  if (end < start) return { error: 'The end date must be on or after the start date.' }
  if (!LEAVE_TYPES.includes(type)) return { error: 'Choose a leave type.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  // Holiday booked by the manager is approved straight away.
  const { error } = await supabase.from('leave_requests').insert({
    employee_id: employeeId,
    start_date: start,
    end_date: end,
    leave_type: type,
    note: optional(form, 'note'),
    status: 'approved',
    decided_by: claims?.claims.sub ?? null,
    decided_at: new Date().toISOString(),
  })
  return done(error)
}

export async function decideLeave(id: string, status: Extract<LeaveStatus, 'approved' | 'declined' | 'cancelled'>): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const { error } = await supabase
    .from('leave_requests')
    .update({ status, decided_by: claims?.claims.sub ?? null, decided_at: new Date().toISOString() })
    .eq('id', id)
  return done(error)
}
