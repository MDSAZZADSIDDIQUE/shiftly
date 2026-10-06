'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult, LeaveType } from '@/lib/types'
import { isDateString, londonToday } from '@/lib/format'
import { done, optional, str } from './helpers'

// Sickness is reported to the manager, who records it; employees request the rest.
const REQUESTABLE: LeaveType[] = ['annual', 'unpaid', 'other']

/** The signed-in employee's own staff record id (row level security only returns their own). */
async function ownEmployeeId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return null
  const { data } = await supabase.from('employees').select('id').eq('user_id', claims.claims.sub).maybeSingle()
  return data?.id ?? null
}

export async function requestLeave(form: FormData): Promise<ActionResult> {
  const start = str(form, 'start_date')
  const end = str(form, 'end_date') || start
  const type = str(form, 'leave_type') as LeaveType
  if (!isDateString(start) || !isDateString(end)) return { error: 'Choose the dates.' }
  if (end < start) return { error: 'The end date must be on or after the start date.' }
  if (start < londonToday()) return { error: 'Choose dates from today onwards.' }
  if (!REQUESTABLE.includes(type)) return { error: 'Choose a type of leave.' }

  const supabase = await createClient()
  const employeeId = await ownEmployeeId(supabase)
  if (!employeeId) return { error: 'Your account is not linked to a staff record yet. Ask your manager.' }

  const { error } = await supabase.from('leave_requests').insert({
    employee_id: employeeId,
    start_date: start,
    end_date: end,
    leave_type: type,
    note: optional(form, 'note'),
    status: 'pending',
  })
  return done(error)
}

/** Withdraw a request the manager hasn't answered yet. */
export async function withdrawLeave(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending')
  return done(error)
}
