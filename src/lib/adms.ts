import 'server-only'
import { createHash } from 'node:crypto'
import { requestHost, slugFromHost } from '@/lib/business'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * ZKTeco "ADMS" / Push protocol. The terminal (on Wi-Fi or 4G) polls this server over HTTP:
 *   GET  /iclock/cdata?SN=...            handshake, we reply with upload options
 *   POST /iclock/cdata?SN=...&table=ATTLOG   attendance records, one per line
 *   GET  /iclock/getrequest?SN=...       asks for pending commands (none for now)
 *   POST /iclock/devicecmd?SN=...        command results
 * Access-control terminals (F22, SpeedFace, inBio...) speak push protocol 3.x on top of that:
 *   POST /iclock/registry?SN=...         registers, we reply with a RegistryCode
 *   GET  /iclock/push?SN=...             asks for upload options
 *   GET  /iclock/ping?SN=...             heartbeat
 *   POST /iclock/cdata?SN=...&table=rtlog    door events, key=value pairs, one event per line
 *   POST /iclock/querydata?SN=...        answers to data queries (we send none)
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

/**
 * rtlog events that mean "this person was identified and let through". Everything else (door
 * state changes, alarms, "too short punch interval", unregistered card, denied...) is not a punch.
 */
const RTLOG_ACCESS_EVENTS = new Set([
  '0', // normal verify open
  '1', // verify during normal open time zone
  '2', // first-personnel open
  '3', // multi-personnel open
  '14', // fingerprint open
  '15', // multi-personnel open (fingerprint)
  '16', // fingerprint during normal open time zone
  '17', // card plus fingerprint open
  '18', // first-personnel open (fingerprint)
  '19', // first-personnel open (card plus fingerprint)
])

/** rtlog lines: time=YYYY-MM-DD HH:MM:SS \t pin=12 \t event=0 \t verifytype=1 \t ... */
export function parseRtLog(body: string): { rows: AttLogRow[]; skipped: number } {
  const rows: AttLogRow[] = []
  let skipped = 0
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const fields = new Map<string, string>()
    for (const part of trimmed.split('\t')) {
      const eq = part.indexOf('=')
      if (eq > 0) fields.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim())
    }
    const userId = fields.get('pin')
    const time = fields.get('time')
    if (!userId || userId === '0' || !time || !TIME_RE.test(time) || !RTLOG_ACCESS_EVENTS.has(fields.get('event') ?? '')) {
      skipped++
      continue
    }
    rows.push({ user_id: userId, time, verify: fields.get('verifytype') ?? null, raw: trimmed })
  }
  return { rows, skipped }
}

/** Uploads that carry nothing we keep (enrolment, photos, door state, logs). Acknowledged and dropped. */
export const IGNORED_TABLES = new Set([
  'OPERLOG',
  'ATTPHOTO',
  'BIODATA',
  'USERINFO',
  'FINGERTMP',
  'FACE',
  'USERPIC',
  'BIOPHOTO',
  'ERRORLOG',
  'OPTIONS',
  'RTSTATE',
])

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

/** A stable code per terminal; the terminal only echoes it back, it is not a secret. */
export function registryResponse(serial: string) {
  const code = createHash('sha256').update(`shiftly:${serial}`).digest('hex').slice(0, 10)
  return `RegistryCode=${code}`
}

export function pushOptionsResponse() {
  return [
    'ServerVersion=3.1.2',
    'ServerName=ADMS',
    'PushVersion=3.1.2',
    'ErrorDelay=30',
    'RequestDelay=10',
    'TransTimes=00:00\t14:05',
    'TransInterval=1',
    'TransTables=User\tTransaction',
    'Realtime=1',
    'TimeoutSec=10',
  ].join('\n')
}

/**
 * One log line per terminal request, so a test with a real terminal shows exactly what it sent.
 * Bodies are cut short: enrolment uploads can carry names and are large.
 */
export function logRequest(request: Request, body?: string) {
  const url = new URL(request.url)
  console.log(
    '[iclock]',
    JSON.stringify({
      method: request.method,
      path: url.pathname,
      query: url.search,
      ip: clientIp(request),
      ua: request.headers.get('user-agent'),
      ...(body !== undefined && { bytes: body.length, body: body.slice(0, 200) }),
    }),
  )
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

/** The business whose subdomain the terminal was pointed at; a new terminal is recorded under it. */
function businessSlug(request: Request) {
  return slugFromHost(requestHost(request.headers))
}

/** Records that the terminal is online. Returns whether a manager has enabled it. */
export async function touchDevice(request: Request, serial: string) {
  const admin = createAdminClient()
  if (!admin) return { configured: false, enabled: false }
  const { data, error } = await admin.rpc('touch_device', {
    p_serial: serial,
    p_ip: clientIp(request),
    p_business_slug: businessSlug(request),
  })
  if (error) throw error
  return { configured: true, enabled: Boolean(data?.enabled) }
}

export async function ingestAttLog(request: Request, serial: string, rows: AttLogRow[]) {
  const admin = createAdminClient()
  if (!admin) return { configured: false, count: 0 }
  const { data, error } = await admin.rpc('ingest_device_punches', {
    p_serial: serial,
    p_ip: clientIp(request),
    p_rows: rows,
    p_business_slug: businessSlug(request),
  })
  if (error) throw error
  return { configured: true, count: Number(data ?? 0) }
}
