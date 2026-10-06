'use client'

import { useEffect, useRef, useState } from 'react'
import { Measure } from '@/components/measure'
import { formatMinutes, formatPence } from '@/lib/format'

const FORMATS = {
  int: (n: number) => Math.round(n).toLocaleString('en-GB'),
  minutes: (n: number) => formatMinutes(Math.round(n)),
  pence: (n: number) => formatPence(Math.round(n)),
}

/** Shows a number and eases to new values on live updates. The first paint is static. */
export function CountUp({ value, format = 'int', duration = 700 }: { value: number; format?: keyof typeof FORMATS; duration?: number }) {
  const [shown, setShown] = useState(value)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // With reduced motion, jump straight to the new value on the next frame.
    const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration
    const from = shown
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(from + (value - from) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return (
    <span className="tabular-nums">
      <Measure>{FORMATS[format](shown)}</Measure>
    </span>
  )
}
