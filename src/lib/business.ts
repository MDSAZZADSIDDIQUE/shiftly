import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Which business a request is for comes from the subdomain: parkway.<ROOT_DOMAIN> is the business with slug
 * "parkway". The bare root domain is the platform admin area. Locally, parkway.localhost:3001 works the same way.
 */
export const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || 'localhost').toLowerCase()

export type Business = {
  id: string
  slug: string
  name: string
  place_word: string
  branch_word: string
  logo_updated_at: string | null
}

/** ISO weekday ("1" = Monday) -> [opens, closes] in UK time. A missing day is closed. */
export type OpeningHours = Partial<Record<string, [string, string]>>

export type Branch = { id: string; name: string; opening_hours: OpeningHours }

export function slugFromHost(host: string | null): string | null {
  if (!host) return null
  const name = host.toLowerCase().replace(/:\d+$/, '')
  if (!name.endsWith(`.${ROOT_DOMAIN}`)) return null
  const sub = name.slice(0, -(ROOT_DOMAIN.length + 1))
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub) && sub !== 'www' ? sub : null
}

export function businessHost(slug: string) {
  return `${slug}.${ROOT_DOMAIN}`
}

/**
 * The address the browser or terminal used. Behind Caddy, and when Next renders the page a server action
 * redirects to, Host is an internal name and the real one is in X-Forwarded-Host.
 */
export function requestHost(headers: Headers) {
  return headers.get('x-forwarded-host')?.split(',')[0].trim() || headers.get('host')
}

export const getBusinessSlug = cache(async () => slugFromHost(requestHost(await headers())))

function admin() {
  const client = createAdminClient()
  if (!client) throw new Error('SUPABASE_SECRET_KEY is not set')
  return client
}

/** The business for this request's subdomain, or null on the root domain. Read with the service role because
 *  the login page needs it before anyone has signed in. */
export const getBusiness = cache(async (): Promise<Business | null> => {
  const slug = await getBusinessSlug()
  if (!slug) return null
  const { data, error } = await admin()
    .from('businesses')
    .select('id, slug, name, place_word, branch_word, logo_updated_at')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data
})

/** For pages that only exist on a business subdomain: an unknown subdomain is a 404. */
export async function requireBusiness() {
  const business = await getBusiness()
  if (!business) notFound()
  return business
}

export const getBranches = cache(async (businessId: string): Promise<Branch[]> => {
  const { data, error } = await admin()
    .from('branches')
    .select('id, name, opening_hours')
    .eq('business_id', businessId)
    .order('created_at')
    .order('name')
  if (error) throw error
  return (data ?? []) as Branch[]
})

export const BRANCH_COOKIE = 'shiftly-branch'

/** The branch the manager is looking at (remembered in a cookie), or null for all branches. */
export const getSelectedBranch = cache(async (businessId: string): Promise<Branch | null> => {
  const branches = await getBranches(businessId)
  if (branches.length === 1) return branches[0]
  const id = (await cookies()).get(BRANCH_COOKIE)?.value
  return branches.find((b) => b.id === id) ?? null
})

/**
 * Opening hours on a date for one branch, or the widest hours across all branches. Null when closed all day.
 * `date` is YYYY-MM-DD (a UK calendar day).
 */
export function openingHoursOn(date: string, branches: Branch[]): { opens: string; closes: string } | null {
  const weekday = String(((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1)
  const open = branches.map((b) => b.opening_hours[weekday]).filter((h): h is [string, string] => Array.isArray(h))
  if (open.length === 0) return null
  return {
    opens: open.map((h) => h[0]).sort()[0],
    closes: open.map((h) => h[1]).sort().at(-1)!,
  }
}

/** "pharmacy" -> "Pharmacy" */
export function capitalise(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** The business's logo, versioned so a new upload isn't served from the browser cache. */
export function logoUrl(business: Business) {
  return business.logo_updated_at ? `/logo?v=${new Date(business.logo_updated_at).getTime()}` : null
}
