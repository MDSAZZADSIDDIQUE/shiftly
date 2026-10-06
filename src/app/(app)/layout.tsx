import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { STORE } from '@/lib/store'
import { requestTime } from '@/lib/format'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', data.claims.sub)
    .maybeSingle()

  if (profile?.role !== 'manager') {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Manager access only</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This dashboard is for store managers. The employee app is coming soon.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </main>
    )
  }

  // Sidebar badges: who's clocked in right now and holiday requests waiting for a decision.
  const recent = new Date(requestTime() - 16 * 3600 * 1000).toISOString()
  const [inRes, leaveRes] = await Promise.all([
    supabase.from('attendance_sessions').select('employee_id').is('clock_out', null).gte('clock_in', recent),
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const counts = {
    clockedIn: new Set((inRes.data ?? []).map((r) => r.employee_id)).size,
    pendingLeave: leaveRes.count ?? 0,
  }

  return (
    <AppShell userName={profile.full_name ?? String(data.claims.email ?? 'Manager')} storeName={STORE.name} counts={counts}>
      {children}
    </AppShell>
  )
}
