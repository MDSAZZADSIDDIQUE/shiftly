import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets and the fingerprint terminal endpoint (/iclock).
    '/((?!_next/static|_next/image|favicon.ico|iclock|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
