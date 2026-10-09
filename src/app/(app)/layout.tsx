import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { getBranches, getBusiness, getSelectedBranch, logoUrl } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import { requestTime } from '@/lib/format'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // The bare domain has no business: it's the platform admin area.
  const business = await getBusiness()
  if (!business) redirect('/admin')

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, business_id')
    .eq('id', data.claims.sub)
    .maybeSingle()

  // Signed in, but to a different business (or none): sign in again here.
  if (profile?.business_id !== business.id) redirect('/login?error=other-business')
  // Employees have their own app.
  if (profile.role !== 'manager') redirect('/me')

  // Sidebar badges: who's clocked in right now and holiday requests waiting for a decision.
  const recent = new Date(requestTime() - 16 * 3600 * 1000).toISOString()
  const [inRes, leaveRes, branches, selected] = await Promise.all([
    supabase.from('attendance_sessions').select('employee_id').is('clock_out', null).gte('clock_in', recent),
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    getBranches(business.id),
    getSelectedBranch(business.id),
  ])
  const counts = {
    clockedIn: new Set((inRes.data ?? []).map((r) => r.employee_id)).size,
    pendingLeave: leaveRes.count ?? 0,
  }

  return (
    <AppShell
      userName={profile.full_name ?? String(data.claims.email ?? 'Manager')}
      business={{
        name: business.name,
        logoUrl: logoUrl(business),
        branchWord: business.branch_word,
        branches: branches.map((b) => ({ id: b.id, name: b.name })),
        selectedBranchId: selected?.id ?? null,
      }}
      counts={counts}
    >
      {children}
    </AppShell>
  )
}
