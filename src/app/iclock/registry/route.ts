import { logRequest, registryResponse, serialFrom, text, touchDevice } from '@/lib/adms'

// Push 3.x terminals register before uploading. The body lists the terminal's capabilities; we only log it.
export async function POST(request: Request) {
  logRequest(request, await request.text())
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  const { configured } = await touchDevice(request, serial)
  if (!configured) return text('ERROR: server not configured', 503)
  return text(registryResponse(serial))
}
