'use server'

import { redirect } from 'next/navigation'
import { getBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'
import { str } from './helpers'

export async function signIn(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: str(form, 'email'),
    password: str(form, 'password'),
  })
  if (error) return { error: error.message }

  // An account belongs to one business and only signs in on its subdomain; the root domain is for the
  // platform admin.
  const business = await getBusiness()
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_id, is_platform_admin')
    .eq('id', data.user.id)
    .maybeSingle()
  const allowed = business ? profile?.business_id === business.id : profile?.is_platform_admin
  if (!allowed) {
    await supabase.auth.signOut()
    return { error: business ? `This account isn't part of ${business.name}.` : 'This account is not a Shiftly admin.' }
  }
  redirect(business ? '/' : '/admin')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
