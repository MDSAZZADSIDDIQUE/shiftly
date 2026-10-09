import { ROOT_DOMAIN, slugFromHost } from '@/lib/business'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Caddy asks here before it requests a certificate for a subdomain (on-demand TLS), so certificates are only
 * issued for businesses that exist, not for any name someone points at the server.
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get('domain')?.toLowerCase() ?? ''
  if (domain === ROOT_DOMAIN) return new Response('ok')
  const slug = slugFromHost(domain)
  if (!slug) return new Response('unknown', { status: 404 })
  const { data } = await createAdminClient()!.from('businesses').select('id').eq('slug', slug).maybeSingle()
  return data ? new Response('ok') : new Response('unknown', { status: 404 })
}
