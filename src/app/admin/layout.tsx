import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { LogOutIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/wordmark'
import { signOut } from '@/lib/actions/auth'
import { getBusinessSlug } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'

/** The platform admin area: only on the bare domain, only for platform admins. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (await getBusinessSlug()) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, is_platform_admin')
    .eq('id', data.claims.sub)
    .maybeSingle()
  if (!profile?.is_platform_admin) redirect('/login')

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="leading-tight">
            <Wordmark className="text-xl" />
            <span className="block text-xs text-muted-foreground">Admin</span>
          </Link>
          <span className="ml-auto truncate text-sm text-muted-foreground max-sm:hidden">{profile.full_name}</span>
          <ThemeToggle />
          <form action={signOut}>
            <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out" title="Sign out">
              <LogOutIcon />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
