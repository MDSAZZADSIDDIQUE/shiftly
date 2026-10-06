import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * ZKTeco "ADMS" / Push protocol. The terminal (on Wi-Fi or 4G) polls this server over HTTP:
 *   GET  /iclock/cdata?SN=...            handshake, we reply with upload options
 *   POST /iclock/cdata?SN=...&table=ATTLOG   attendance records, one per line
 *   GET  /iclock/getrequest?SN=...       asks for pending commands (none for now)
 *   POST /iclock/devicecmd?SN=...        command results
 * Fingerprint templates never leave the terminal; only "user 12 punched at 09:01:33" is sent.
 */

export type AttLogRow = { user_id: string; time: string; verify: string | null; raw: string }

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** ATTLOG lines: PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode \t ... */
export function parseAttLog(body: string): AttLogRow[] {
  const rows: AttLogRow[] = []
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split('\t').map((p) => p.trim())
    const [userId, time, , verify] = parts
    if (!userId || !time || !TIME_RE.test(time)) continue
    rows.push({ user_id: userId, time, verify: verify ?? null, raw: trimmed })
  }
  return rows
}

export function handshakeResponse(serial: string) {
  return [
    `GET OPTION FROM: ${serial}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog',
    'Realtime=1',
    'Encrypt=None',
  ].join('\n')
}

export function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  )
}

export function serialFrom(request: Request) {
  const sn = new URL(request.url).searchParams.get('SN')?.trim()
  return sn && /^[A-Za-z0-9_-]{1,64}$/.test(sn) ? sn : null
}

/** Records that the terminal is online. Returns whether a manager has enabled it. */
export async function touchDevice(serial: string, ip: string | null) {
  const admin = createAdminClient()
  if (!admin) return { configured: false, enabled: false }
  const { data, error } = await admin.rpc('touch_device', { p_serial: serial, p_ip: ip })
  if (error) throw error
  return { configured: true, enabled: Boolean(data) }
}

export async function ingestAttLog(serial: string, ip: string | null, rows: AttLogRow[]) {
  const admin = createAdminClient()
  if (!admin) return { configured: false, count: 0 }
  const { data, error } = await admin.rpc('ingest_device_punches', {
    p_serial: serial,
    p_ip: ip,
    p_rows: rows,
  })
  if (error) throw error
  return { configured: true, count: Number(data ?? 0) }
}
