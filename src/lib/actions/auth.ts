'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'
import { str } from './helpers'

export async function signIn(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: str(form, 'email'),
    password: str(form, 'password'),
  })
  if (error) return { error: error.message }
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
