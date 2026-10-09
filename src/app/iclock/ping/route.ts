import { serialFrom, text, touchDevice } from '@/lib/adms'

// Push 3.x heartbeat. Not logged: it arrives every few seconds.
export async function GET(request: Request) {
  const serial = serialFrom(request)
  if (!serial) return text('ERROR: missing SN', 400)

  try {
    await touchDevice(request, serial)
  } catch (error) {
    console.error('[iclock] heartbeat failed', serial, error)
  }
  return text('OK')
}
