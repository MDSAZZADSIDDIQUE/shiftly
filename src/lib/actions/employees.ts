'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'
import { isDateString } from '@/lib/format'
import { done, hoursToMinutes, optional, poundsToPence, str } from './helpers'

function employeeFields(form: FormData) {
  const daily = hoursToMinutes(str(form, 'daily_hours'))
  if (daily === 'invalid') return { error: 'Working hours must be between 0 and 24.' } as const
  const fullName = str(form, 'full_name')
  if (!fullName) return { error: 'Name is required.' } as const
  return {
    values: {
      full_name: fullName,
      email: optional(form, 'email'),
      phone: optional(form, 'phone'),
      job_title: optional(form, 'job_title'),
      device_user_id: optional(form, 'device_user_id'),
      branch_id: optional(form, 'branch_id'),
      daily_minutes: daily,
      color: str(form, 'color') || '#4f6d8f',
      started_on: isDateString(str(form, 'started_on')) ? str(form, 'started_on') : null,
    },
  } as const
}

export async function createEmployee(form: FormData): Promise<ActionResult> {
  const parsed = employeeFields(form)
  if ('error' in parsed) return { error: parsed.error }

  const supabase = await createClient()
  const { data, error } = await supabase.from('employees').insert(parsed.values).select('id').single()
  if (error) return done(error)

  const rate = str(form, 'hourly_rate')
  if (rate) {
    const pence = poundsToPence(rate)
    if (pence === 'invalid') return { error: 'Hourly rate is not a valid amount.' }
    const { error: rateError } = await supabase.from('pay_rates').insert({
      employee_id: data.id,
      hourly_rate_pence: pence,
      effective_from: parsed.values.started_on ?? '2000-01-01',
    })
    if (rateError) return done(rateError)
  }
  return done()
}

export async function updateEmployee(id: string, form: FormData): Promise<ActionResult> {
  const parsed = employeeFields(form)
  if ('error' in parsed) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('employees')
    .update({ ...parsed.values, active: form.get('active') === 'on' })
    .eq('id', id)
  return done(error)
}

export async function addPayRate(employeeId: string, form: FormData): Promise<ActionResult> {
  const pence = poundsToPence(str(form, 'hourly_rate'))
  const from = str(form, 'effective_from')
  if (pence === 'invalid' || !str(form, 'hourly_rate')) return { error: 'Enter an hourly rate, e.g. 12.71.' }
  if (!isDateString(from)) return { error: 'Choose the date the rate starts.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('pay_rates')
    .insert({ employee_id: employeeId, hourly_rate_pence: pence, effective_from: from })
  return done(error)
}

export async function deletePayRate(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('pay_rates').delete().eq('id', id)
  return done(error)
}
