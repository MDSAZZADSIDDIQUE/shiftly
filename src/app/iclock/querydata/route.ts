import { logRequest, text } from '@/lib/adms'

// Answers to data queries sent to the terminal. We don't send any yet.
export async function POST(request: Request) {
  logRequest(request, await request.text())
  return text('OK')
}
