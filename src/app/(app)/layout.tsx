import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
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

  // Employees have their own app.
  if (profile?.role !== 'manager') redirect('/me')

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
