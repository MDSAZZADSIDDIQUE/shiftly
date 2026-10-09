'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, ViewTransition, type ReactNode } from 'react'
import {
  CalendarDaysIcon,
  ClockIcon,
  FingerprintIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  PalmtreeIcon,
  PoundSterlingIcon,
  UsersIcon,
} from 'lucide-react'
import { BranchSwitcher } from '@/components/branch-switcher'
import { ThemeToggle } from '@/components/theme'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { signOut } from '@/lib/actions/auth'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export type NavCounts = { clockedIn: number; pendingLeave: number }

/** What the shell shows about the business: its name, logo (if any) and branches. */
export type ShellBusiness = {
  name: string
  logoUrl: string | null
  branchWord: string
  branches: { id: string; name: string }[]
  selectedBranchId: string | null
}

const NAV = [
  { href: '/', label: 'Today', icon: LayoutDashboardIcon, badge: 'clockedIn' as const },
  { href: '/attendance', label: 'Timesheet', icon: ClockIcon },
  { href: '/calendar', label: 'Rota', icon: CalendarDaysIcon },
  { href: '/employees', label: 'Staff', icon: UsersIcon },
  { href: '/leave', label: 'Holidays', icon: PalmtreeIcon, badge: 'pendingLeave' as const },
  { href: '/wages', label: 'Wages', icon: PoundSterlingIcon },
  { href: '/devices', label: 'Terminals', icon: FingerprintIcon },
]

function Brand({ business }: { business: ShellBusiness }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 px-1.5 leading-tight" aria-label={`${business.name}, today`}>
      {business.logoUrl && (
        // The business's own logo, uploaded by the platform admin; small and already sized, so a plain img.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={business.logoUrl} alt="" className="size-9 shrink-0 rounded-md bg-white object-contain p-0.5" />
      )}
      <span className="min-w-0">
        <Wordmark className="text-[1.35rem]" />
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{business.name}</span>
      </span>
    </Link>
  )
}

function BranchPicker({ business }: { business: ShellBusiness }) {
  return <BranchSwitcher branches={business.branches} selectedId={business.selectedBranchId} branchWord={business.branchWord} />
}

function NavLinks({ counts, onNavigate, animated }: { counts: NavCounts; onNavigate?: () => void; animated?: boolean }) {
  const pathname = usePathname()
  return (
    <nav className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        const count = badge ? counts[badge] : 0
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground',
              active && 'bg-sidebar-accent font-medium text-foreground'
            )}
          >
            {active &&
              (animated ? (
                // A single named marker that slides to the new item on navigation.
                <ViewTransition name="nav-indicator" share="indicator" default="none">
                  <span className="absolute inset-y-2 -left-4 w-0.5 rounded-r-full bg-primary" />
                </ViewTransition>
              ) : (
                <span className="absolute inset-y-2 -left-4 w-0.5 rounded-r-full bg-primary" />
              ))}
            <Icon className={cn('size-4', active ? 'text-foreground' : 'text-muted-foreground/80')} />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              // A quiet count, not a pill: green dot for who's in, warm text for requests waiting.
              <span
                className={cn(
                  'flex items-center gap-1.5 text-xs tabular-nums',
                  badge === 'clockedIn' ? 'text-muted-foreground' : 'font-medium text-warning-text'
                )}
                title={badge === 'clockedIn' ? `${count} clocked in` : `${count} waiting for approval`}
              >
                {badge === 'clockedIn' && <span className="size-1.5 rounded-full bg-success" />}
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

function UserFooter({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 border-t px-1 pt-4">
      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">Manager</p>
      </div>
      <ThemeToggle />
      <form action={signOut}>
        <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out" title="Sign out">
          <LogOutIcon />
        </Button>
      </form>
    </div>
  )
}

export function AppShell({
  userName,
  business,
  counts,
  children,
}: {
  userName: string
  business: ShellBusiness
  counts: NavCounts
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  return (
    <div className="flex min-h-svh">
      <aside className="dark sidebar-ink sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-7 border-r bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
        <div className="grid gap-4">
          <Brand business={business} />
          <BranchPicker business={business} />
        </div>
        <div className="flex-1">
          <NavLinks counts={counts} animated />
        </div>
        <UserFooter name={userName} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </Button>
          <Brand business={business} />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="dark sidebar-ink flex w-72 flex-col gap-7 bg-sidebar px-4 py-5 text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="grid gap-4">
              <Brand business={business} />
              <BranchPicker business={business} />
            </div>
            <div className="flex-1">
              <NavLinks counts={counts} onNavigate={() => setOpen(false)} />
            </div>
            <UserFooter name={userName} />
          </SheetContent>
        </Sheet>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Keyed by route so each navigation plays the page exit/enter animation. */}
          <ViewTransition key={pathname} enter="page-enter" exit="page-exit" default="none">
            <div>{children}</div>
          </ViewTransition>
        </main>
      </div>
    </div>
  )
}
