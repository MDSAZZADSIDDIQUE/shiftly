'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type * as Charts from '@/components/charts'

// Recharts is the largest library in the app (~100 KB gzipped) and the charts sit below the fold, so it loads
// after the page is interactive instead of before. Each wrapper keeps the chart's height so nothing jumps.
const Hours = dynamic(() => import('@/components/charts').then((m) => m.HoursChart), { ssr: false })
const Wages = dynamic(() => import('@/components/charts').then((m) => m.WagesChart), { ssr: false })

export function HoursChart(props: ComponentProps<typeof Charts.HoursChart>) {
  return (
    <div style={{ minHeight: props.height ?? 240 }}>
      <Hours {...props} />
    </div>
  )
}

export function WagesChart(props: ComponentProps<typeof Charts.WagesChart>) {
  return (
    <div style={{ minHeight: Math.max(160, props.data.length * 44) }}>
      <Wages {...props} />
    </div>
  )
}
