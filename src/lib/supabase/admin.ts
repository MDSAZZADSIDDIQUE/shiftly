import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client for trusted server code only (the fingerprint terminal endpoint).
 * Bypasses row level security — never import this from a client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
