import 'server-only'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

export function str(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export function optional(form: FormData, key: string) {
  return str(form, key) || null
}

/** "5" / "4.5" / "4:30" hours -> minutes. Empty -> null. */
export function hoursToMinutes(value: string): number | null | 'invalid' {
  if (!value) return null
  const hm = value.match(/^(\d{1,2}):(\d{2})$/)
  const minutes = hm ? Number(hm[1]) * 60 + Number(hm[2]) : Math.round(Number(value) * 60)
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return 'invalid'
  return minutes
}

/** "12.71" -> 1271 pence */
export function poundsToPence(value: string): number | 'invalid' {
  const pence = Math.round(Number(value.replace(/^£/, '')) * 100)
  return Number.isFinite(pence) && pence >= 0 ? pence : 'invalid'
}

export function done(error?: { message: string } | null): ActionResult {
  if (error) return { error: friendly(error.message) }
  revalidatePath('/', 'layout')
  return { ok: true }
}

function friendly(message: string) {
  if (message.includes('employees_device_user_id_key')) return 'That fingerprint user ID is already assigned to someone else.'
  if (message.includes('pay_rates_employee_id_effective_from_key')) return 'There is already a rate starting on that date.'
  if (message.includes('shifts_employee_id_tstzrange_excl') || message.includes('conflicting key value violates exclusion constraint'))
    return 'This shift overlaps another shift for the same employee.'
  if (message.includes('attendance_sessions_check')) return 'Clock out must be after clock in.'
  if (message.includes('row-level security')) return 'You do not have permission to do that.'
  return message
}
