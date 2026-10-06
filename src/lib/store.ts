/** Store-wide settings. Override with env vars when deploying for a real store. */
export const STORE = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || 'My Store',
  /** Opening hours (UK time), used to shade the day timeline. */
  opens: process.env.NEXT_PUBLIC_STORE_OPENS || '08:00',
  closes: process.env.NEXT_PUBLIC_STORE_CLOSES || '20:00',
}

/** Employee colours: ten muted hues of similar weight so no one person dominates a chart. */
export const PALETTE = [
  '#4f6d8f', // slate blue
  '#5f8a6e', // sage
  '#b8873a', // ochre
  '#b5583f', // terracotta
  '#3f8a8c', // teal
  '#7a5c8e', // plum
  '#a8606f', // rosewood
  '#6b7a3c', // olive
  '#8a6a4f', // walnut
  '#c07a3e', // copper
]

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
