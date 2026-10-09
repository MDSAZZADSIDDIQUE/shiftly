'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getBusinessSlug } from '@/lib/business'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'
import { optional, str } from './helpers'

const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/
const RESERVED = ['www', 'admin', 'api', 'mail']
const TIME = /^\d{2}:\d{2}$/
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_LOGO_BYTES = 512 * 1024

/**
 * Every admin action runs on the bare domain and only for a platform admin. Writes then use the service role,
 * because businesses and branches have no write policies for signed-in users.
 */
async function platformAdmin() {
  if (await getBusinessSlug()) throw new Error('The admin area is only on the root domain.')
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('is_platform_admin').eq('id', data.claims.sub).maybeSingle()
  if (!profile?.is_platform_admin) throw new Error('Only a platform admin can do that.')
  const admin = createAdminClient()
  if (!admin) throw new Error('SUPABASE_SECRET_KEY is not set')
  return admin
}

function finish(error?: { message: string } | null): ActionResult {
  if (error) {
    if (error.message.includes('businesses_slug_key')) return { error: 'That address is already taken.' }
    if (error.message.includes('branches_business_id_name_key')) return { error: 'There is already a branch with that name.' }
    return { error: error.message }
  }
  revalidatePath('/admin', 'layout')
  return { ok: true }
}

function words(form: FormData) {
  const name = str(form, 'name')
  const place = str(form, 'place_word').toLowerCase() || 'shop'
  const branch = str(form, 'branch_word').toLowerCase() || 'branch'
  if (!name) return { error: 'Enter the business name.' } as const
  if (!/^[a-zà-ÿ' -]{2,20}$/i.test(place) || !/^[a-zà-ÿ' -]{2,20}$/i.test(branch)) {
    return { error: 'Keep the words short and plain, e.g. "pharmacy" and "branch".' } as const
  }
  return { values: { name, place_word: place, branch_word: branch } } as const
}

export async function createBusiness(form: FormData): Promise<ActionResult> {
  const admin = await platformAdmin()
  const slug = str(form, 'slug').toLowerCase()
  if (!SLUG.test(slug) || RESERVED.includes(slug)) {
    return { error: 'The address can use lowercase letters, numbers and dashes, e.g. "parkway".' }
  }
  const parsed = words(form)
  if ('error' in parsed) return { error: parsed.error }

  const { data, error } = await admin.from('businesses').insert({ slug, ...parsed.values }).select('id').single()
  if (error) return finish(error)
  // Every business starts with one branch so terminals and the rota have somewhere to go.
  const { error: branchError } = await admin.from('branches').insert({ business_id: data.id, name: str(form, 'first_branch') || 'Main branch' })
  if (branchError) return finish(branchError)
  revalidatePath('/admin', 'layout')
  redirect(`/admin/${slug}`)
}

export async function updateBusiness(businessId: string, form: FormData): Promise<ActionResult> {
  const admin = await platformAdmin()
  const parsed = words(form)
  if ('error' in parsed) return { error: parsed.error }
  const { error } = await admin.from('businesses').update(parsed.values).eq('id', businessId)
  return finish(error)
}

export async function uploadLogo(businessId: string, form: FormData): Promise<ActionResult> {
  const admin = await platformAdmin()
  const file = form.get('logo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image.' }
  if (!LOGO_TYPES.includes(file.type)) return { error: 'Use a PNG, JPEG, WebP or SVG image.' }
  if (file.size > MAX_LOGO_BYTES) return { error: 'Keep the logo under 512 KB.' }
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error } = await admin
    .from('businesses')
    // PostgREST takes bytea as "\x" followed by hex.
    .update({ logo: `\\x${bytes.toString('hex')}`, logo_type: file.type, logo_updated_at: new Date().toISOString() })
    .eq('id', businessId)
  return finish(error)
}

export async function removeLogo(businessId: string): Promise<ActionResult> {
  const admin = await platformAdmin()
  const { error } = await admin.from('businesses').update({ logo: null, logo_type: null, logo_updated_at: null }).eq('id', businessId)
  return finish(error)
}

/** Opening hours from fields opens_1..opens_7 / closes_1..closes_7; a day with both empty is closed. */
function openingHours(form: FormData) {
  const hours: Record<string, [string, string]> = {}
  for (let day = 1; day <= 7; day++) {
    const opens = str(form, `opens_${day}`)
    const closes = str(form, `closes_${day}`)
    if (!opens && !closes) continue
    if (!TIME.test(opens) || !TIME.test(closes) || closes <= opens) {
      return { error: 'Each open day needs an opening time before its closing time.' } as const
    }
    hours[String(day)] = [opens, closes]
  }
  return { hours } as const
}

export async function addBranch(businessId: string, form: FormData): Promise<ActionResult> {
  const admin = await platformAdmin()
  const name = str(form, 'name')
  if (!name) return { error: 'Enter the branch name.' }
  const { error } = await admin.from('branches').insert({ business_id: businessId, name })
  return finish(error)
}

export async function updateBranch(branchId: string, form: FormData): Promise<ActionResult> {
  const admin = await platformAdmin()
  const name = str(form, 'name')
  if (!name) return { error: 'Enter the branch name.' }
  const parsed = openingHours(form)
  if ('error' in parsed) return { error: parsed.error }
  const { error } = await admin.from('branches').update({ name, opening_hours: parsed.hours }).eq('id', branchId)
  return finish(error)
}

export async function deleteBranch(branchId: string): Promise<ActionResult> {
  const admin = await platformAdmin()
  const { data } = await admin.from('branches').select('business_id').eq('id', branchId).single()
  const { count } = await admin.from('branches').select('id', { count: 'exact', head: true }).eq('business_id', data?.business_id)
  if ((count ?? 0) <= 1) return { error: 'A business needs at least one branch.' }
  // Shifts, terminals and staff at the branch keep their history; they just lose the branch.
  const { error } = await admin.from('branches').delete().eq('id', branchId)
  return finish(error)
}

export type NewManager = ActionResult & { email?: string; password?: string }

/**
 * Creates a manager's sign-in for a business with a one-off password to pass on. (There is no email server, so
 * there is no invite email.)
 */
export async function addManager(businessId: string, form: FormData): Promise<NewManager> {
  const admin = await platformAdmin()
  const email = str(form, 'email').toLowerCase()
  const fullName = optional(form, 'full_name')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter their email address.' }
  const password = randomBytes(9).toString('base64url')
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { business_id: businessId, role: 'manager' },
    user_metadata: fullName ? { full_name: fullName } : {},
  })
  if (error) return { error: error.message.includes('already') ? 'There is already an account with that email.' : error.message }
  revalidatePath('/admin', 'layout')
  return { ok: true, email, password }
}

/** Give a terminal that called the bare domain to a business (and branch). */
export async function assignDevice(deviceId: string, form: FormData): Promise<ActionResult> {
  const admin = await platformAdmin()
  const branchId = str(form, 'branch_id')
  if (!branchId) return { error: 'Choose a branch.' }
  const { data: branch } = await admin.from('branches').select('business_id').eq('id', branchId).single()
  if (!branch) return { error: 'That branch no longer exists.' }
  const { error } = await admin.from('devices').update({ business_id: branch.business_id, branch_id: branchId }).eq('id', deviceId).is('business_id', null)
  return finish(error)
}
