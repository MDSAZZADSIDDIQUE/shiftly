import { clientIp, logRequest, pushOptionsResponse, serialFrom, text, touchDevice } from '@/lib/adms'

// After registering, push 3.x terminals ask here for their upload options.
async function handle(request: Request) {
  logRequest(request, request.method === 'POST' ? await request.text() : undefined)
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  const { configured } = await touchDevice(serial, clientIp(request))
  if (!configured) return text('ERROR: server not configured', 503)
  return text(pushOptionsResponse())
}

export { handle as GET, handle as POST }
