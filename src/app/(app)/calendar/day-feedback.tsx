'use client'

import { useEffect, useRef } from 'react'
import { useLinkStatus } from 'next/link'

/** Inside a day cell: outlines the tapped day straight away, while the page fetches it. */
export function DayPending() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-primary/70 transition-opacity ${pending ? 'animate-pulse opacity-100' : 'opacity-0'}`}
    />
  )
}

/**
 * Brings the selected day's details into view when they sit below the screen, as they do on a phone
 * where the details come after the month. Remount (key by day) to run on each new selection.
 */
export function RevealDay() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const target = ref.current?.parentElement
    if (!target) return
    const { top } = target.getBoundingClientRect()
    if (top > window.innerHeight * 0.6) {
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    }
  }, [])
  return <span ref={ref} hidden />
}
