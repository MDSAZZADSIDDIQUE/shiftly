import { clientIp, serialFrom, text, touchDevice } from '@/lib/adms'

// The terminal polls here for commands. We have none to send, so this doubles as a heartbeat.
export async function GET(request: Request) {
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  try {
    await touchDevice(serial, clientIp(request))
  } catch (error) {
    console.error('[iclock] heartbeat failed', serial, error)
  }
  return text('OK')
}
