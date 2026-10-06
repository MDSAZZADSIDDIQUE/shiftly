'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'
import { done, optional, str } from './helpers'

export async function updateDevice(id: string, form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('devices')
    .update({ name: optional(form, 'name'), enabled: form.get('enabled') === 'on' })
    .eq('id', id)
  return done(error)
}

/** Pre-register a terminal by serial number so it is enabled the moment it connects. */
export async function addDevice(form: FormData): Promise<ActionResult> {
  const serial = str(form, 'serial_number')
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(serial)) return { error: 'Enter the serial number shown on the terminal.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('devices')
    .upsert({ serial_number: serial, name: optional(form, 'name'), enabled: true }, { onConflict: 'serial_number' })
  return done(error)
}

export async function deleteDevice(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('devices').delete().eq('id', id)
  return done(error)
}
