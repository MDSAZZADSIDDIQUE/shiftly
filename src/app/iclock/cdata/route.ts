import {
  IGNORED_TABLES,
  clientIp,
  handshakeResponse,
  ingestAttLog,
  logRequest,
  parseAttLog,
  parseRtLog,
  serialFrom,
  text,
  touchDevice,
} from '@/lib/adms'

export async function GET(request: Request) {
  logRequest(request)
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  const { configured } = await touchDevice(serial, clientIp(request))
  if (!configured) return text('ERROR: server not configured', 503)
  return text(handshakeResponse(serial))
}

export async function POST(request: Request) {
  const body = await request.text()
  logRequest(request, body)
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  const params = new URL(request.url).searchParams
  const table = params.get('table')?.toUpperCase()
  const ip = clientIp(request)

  try {
    if (table === 'ATTLOG' || table === 'RTLOG') {
      const rows = table === 'ATTLOG' ? parseAttLog(body) : parseRtLog(body).rows
      const { configured } = await ingestAttLog(serial, ip, rows)
      if (!configured) return text('ERROR: server not configured', 503)
      return text(`OK: ${rows.length}`)
    }

    if (table && IGNORED_TABLES.has(table)) {
      await touchDevice(serial, ip)
      return text('OK')
    }

    // Push 3.x enrolment uploads (users, templates, photos): the terminal expects "<tablename>=<count>".
    if (table === 'TABLEDATA') {
      await touchDevice(serial, ip)
      return text(`${params.get('tablename') ?? 'data'}=${params.get('count') ?? 0}`)
    }

    // An upload we don't understand may hold scans. Refusing it makes the terminal keep it and retry,
    // instead of deleting it after we drop it.
    console.warn('[iclock] unsupported table', serial, table)
    return text('ERROR: unsupported table', 400)
  } catch (error) {
    console.error('[iclock] ingest failed', serial, error)
    // A non-OK reply makes the terminal keep the records and retry later.
    return text('ERROR', 500)
  }
}
