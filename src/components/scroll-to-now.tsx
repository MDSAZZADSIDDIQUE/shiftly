'use client'

import { useEffect, useRef } from 'react'

/**
 * Scrolls the nearest sideways scroller so this marker sits in view, a little past the middle.
 * On a phone the timeline opens at the start of the day, often hours before "now".
 */
export function ScrollToNow({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const marker = ref.current
    const scroller = marker?.closest<HTMLElement>('[data-timeline-scroller]')
    if (!marker || !scroller || scroller.scrollWidth <= scroller.clientWidth) return
    const offset = marker.getBoundingClientRect().left - scroller.getBoundingClientRect().left
    scroller.scrollLeft += offset - scroller.clientWidth * 0.6
  }, [])
  return <span ref={ref} className={className} style={style} />
}
