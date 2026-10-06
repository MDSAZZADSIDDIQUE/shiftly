import {
  clientIp,
  handshakeResponse,
  ingestAttLog,
  parseAttLog,
  serialFrom,
  text,
  touchDevice,
} from '@/lib/adms'

export async function GET(request: Request) {
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  const { configured } = await touchDevice(serial, clientIp(request))
  if (!configured) return text('ERROR: server not configured', 503)
  return text(handshakeResponse(serial))
}

export async function POST(request: Request) {
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  const table = new URL(request.url).searchParams.get('table')?.toUpperCase()
  const body = await request.text()
  const ip = clientIp(request)

  try {
    if (table === 'ATTLOG') {
      const rows = parseAttLog(body)
      const { configured } = await ingestAttLog(serial, ip, rows)
      if (!configured) return text('ERROR: server not configured', 503)
      return text(`OK: ${rows.length}`)
    }

    // OPERLOG, user/fingerprint enrolment and photos are acknowledged but not stored.
    await touchDevice(serial, ip)
    return text('OK')
  } catch (error) {
    console.error('[iclock] ingest failed', serial, error)
    // A non-OK reply makes the terminal keep the records and retry later.
    return text('ERROR', 500)
  }
}
