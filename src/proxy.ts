import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets, the fingerprint terminal endpoint (/iclock) and the business logo, which
    // the login page shows before anyone has signed in.
    '/((?!_next/static|_next/image|favicon.ico|iclock|logo$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
