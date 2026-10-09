import { getBusiness } from '@/lib/business'
import { createAdminClient } from '@/lib/supabase/admin'

/** The logo of the business whose subdomain this is. */
export async function GET() {
  const business = await getBusiness()
  if (!business?.logo_updated_at) return new Response('Not found', { status: 404 })

  const { data } = await createAdminClient()!
    .from('businesses')
    .select('logo, logo_type')
    .eq('id', business.id)
    .single()
  if (!data?.logo) return new Response('Not found', { status: 404 })

  // PostgREST returns bytea as "\x" followed by hex.
  const bytes = Buffer.from(String(data.logo).slice(2), 'hex')
  return new Response(bytes, {
    headers: {
      'Content-Type': data.logo_type,
      // The URL carries a version, so the logo can be cached for good.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // An SVG opened on its own must not be able to run script.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
