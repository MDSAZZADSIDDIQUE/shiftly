import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOutIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/wordmark'
import { signOut } from '@/lib/actions/auth'
import { getBusiness } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'

/** The employee app: one narrow column, built for a phone. Managers use the main app instead. */
export default async function MeLayout({ children }: { children: ReactNode }) {
  const business = await getBusiness()
  if (!business) redirect('/admin')

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, business_id').eq('id', data.claims.sub).maybeSingle()
  if (profile?.business_id !== business.id) redirect('/login?error=other-business')
  if (profile.role === 'manager') redirect('/')

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <Link href="/me" className="min-w-0 leading-tight">
            <Wordmark className="text-xl" />
            <span className="block truncate text-xs text-muted-foreground">{business.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <form action={signOut}>
              <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out" title="Sign out">
                <LogOutIcon />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
