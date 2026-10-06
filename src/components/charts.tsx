'use client'

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export type HoursPoint = { label: string; worked: number; paid: number }

/** Worked vs paid hours per day. `color` tints the worked bars (e.g. an employee's colour). */
export function HoursChart({ data, height = 240, color }: { data: HoursPoint[]; height?: number; color?: string }) {
  const config = {
    worked: { label: 'Hours worked', color: color ?? 'var(--chart-1)' },
    paid: { label: 'Paid hours', color: 'var(--chart-2)' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: -16, right: 4, top: 8 }} barGap={2}>
        <CartesianGrid vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} unit="h" />
        <ChartTooltip cursor={{ fill: 'var(--muted)', radius: 6 }} content={<ChartTooltipContent />} />
        <Bar dataKey="worked" fill="var(--color-worked)" radius={[5, 5, 1, 1]} maxBarSize={22} />
        <Bar dataKey="paid" fill="var(--color-paid)" radius={[5, 5, 1, 1]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  )
}

const wagesConfig = {
  gross: { label: 'Gross pay (£)', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** One bar per employee in their own colour. */
export function WagesChart({ data }: { data: { name: string; gross: number; color: string }[] }) {
  return (
    <ChartContainer config={wagesConfig} className="w-full" style={{ height: Math.max(160, data.length * 44) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeOpacity={0.6} />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `£${v}`} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} width={110} />
        <ChartTooltip cursor={{ fill: 'var(--muted)', radius: 6 }} content={<ChartTooltipContent />} />
        <Bar dataKey="gross" radius={[1, 6, 6, 1]} maxBarSize={26}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
