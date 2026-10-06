import Link from 'next/link'
import type { ReactNode } from 'react'
import { InfoIcon } from 'lucide-react'
import { Ridges } from '@/components/ridges'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PersonAvatar({
  name,
  color,
  size = 'md',
  status,
  muted,
}: {
  name: string
  color: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  status?: 'in' | 'out' | 'warn'
  muted?: boolean
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-card',
          size === 'xs' && 'size-5 text-[0.55rem]',
          size === 'sm' && 'size-7 text-[0.65rem]',
          size === 'md' && 'size-9 text-xs',
          size === 'lg' && 'size-14 text-base',
          muted && 'opacity-45 grayscale-[35%]'
        )}
        style={{ backgroundColor: color }}
      >
        {initials(name)}
      </span>
      {status && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card',
            status === 'in' && 'bg-success',
            status === 'out' && 'bg-idle',
            status === 'warn' && 'bg-warning'
          )}
        />
      )}
    </span>
  )
}

export function StatCard({
  label,
  value,
  hint,
  visual,
  href,
}: {
  label: string
  value: ReactNode
  /** Plain content only when `href` is set: the whole card is already a link. */
  hint?: ReactNode
  /** Sparkline, ring or similar shown on the right. */
  visual?: ReactNode
  /** Makes the card a link to the page with the details. */
  href?: string
}) {
  const className = cn(
    'surface rise-in flex items-end gap-3 rounded-2xl p-4 sm:p-5',
    href && 'hoverable outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
  )
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="eyebrow truncate">{label}</p>
        <p className="mt-3 font-display text-[2.1rem] leading-none font-light tracking-tight tabular-nums">{value}</p>
        {hint && <div className="mt-2.5 truncate text-xs text-muted-foreground">{hint}</div>}
      </div>
      {visual && <div className="shrink-0 max-[479px]:hidden">{visual}</div>}
    </>
  )
  return href ? (
    <Link href={href} className={className}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-[1.75rem] font-medium tracking-[-0.02em] sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({
  title,
  description,
  info,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  /** Short factual subtitle, e.g. "6 shifts · 31h scheduled". */
  description?: ReactNode
  /** How to read the panel. Kept out of the way in an ⓘ tooltip. */
  info?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('surface rise-in rounded-2xl', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-1 sm:px-6 sm:pt-5">
          <div>
            {title && (
              <h2 className="flex items-center gap-1.5 font-display text-[1.05rem] font-medium tracking-tight">
                {title}
                {info && <InfoTip>{info}</InfoTip>}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn('p-4 sm:px-6 sm:pb-6', bodyClassName)}>{children}</div>
    </section>
  )
}

/** A small ⓘ that explains something on hover or focus. */
export function InfoTip({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" aria-label="About this" />}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 font-sans font-normal tracking-normal">{children}</TooltipContent>
    </Tooltip>
  )
}

/** Empty state: a small ridge drawing with the icon in brass at its centre, a title and an optional action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: ReactNode
  title?: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-5' : 'py-10')}>
      {icon && (
        <span className="relative mb-4 flex size-20 items-center justify-center" aria-hidden>
          <Ridges rings={7} strokeWidth={1.6} className="absolute inset-0 size-full text-muted-foreground/30" />
          <span className="relative flex size-8 items-center justify-center rounded-full bg-card text-primary [&_svg]:size-4">{icon}</span>
        </span>
      )}
      {title && <p className="font-display text-base font-medium">{title}</p>}
      {children && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Section label inside a panel, e.g. "Working now · 3". */
export function GroupLabel({ children, count, dot }: { children: ReactNode; count?: number; dot?: string }) {
  return (
    <p className="eyebrow mb-2.5 flex items-center gap-2">
      {dot && <span className="size-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
      {count != null && <span className="font-normal tabular-nums">{count}</span>}
    </p>
  )
}
