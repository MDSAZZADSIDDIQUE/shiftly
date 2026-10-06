'use client'

import { ThemeProvider as NextThemes, useTheme } from 'next-themes'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  )
}

const ORDER = ['light', 'dark', 'system'] as const
const subscribe = () => () => {}

/** Cycles light → dark → system. Light is the default. */
export function ThemeToggle() {
  const { theme = 'light', setTheme } = useTheme()
  // The stored theme is only known in the browser; render the default's icon on the server.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const current = mounted ? theme : 'light'
  const next = ORDER[(ORDER.indexOf(current as (typeof ORDER)[number]) + 1) % ORDER.length]
  const Icon = current === 'dark' ? MoonIcon : current === 'light' ? SunIcon : MonitorIcon
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${current}. Switch to ${next}`}
      title={`Theme: ${current}`}
    >
      <Icon />
    </Button>
  )
}
