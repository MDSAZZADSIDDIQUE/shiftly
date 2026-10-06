import { londonToday, minutesToHours } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { WageRow } from '@/lib/types'
import { periodFrom } from '@/lib/wages'

function csvCell(value: string | number) {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Gross wages as CSV, ready to import into payroll software. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { from, to } = periodFrom(params, londonToday())

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('wage_report', { p_from: from, p_to: to })
  if (error) return new Response(error.message, { status: 400 })

  const header = ['Employee', 'From', 'To', 'Days worked', 'Hours worked', 'Paid hours', 'Current hourly rate (GBP)', 'Gross pay (GBP)']
  const lines = ((data ?? []) as WageRow[]).map((r) =>
    [
      r.full_name,
      from,
      to,
      r.days_worked,
      (Number(r.worked_seconds) / 3600).toFixed(2),
      minutesToHours(Number(r.paid_minutes)).toFixed(2),
      r.current_rate_pence != null ? (r.current_rate_pence / 100).toFixed(2) : '',
      (Number(r.gross_pence) / 100).toFixed(2),
    ]
      .map(csvCell)
      .join(',')
  )

  return new Response([header.join(','), ...lines].join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="wages-${from}-to-${to}.csv"`,
    },
  })
}
