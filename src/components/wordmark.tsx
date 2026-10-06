import { cn } from '@/lib/utils'

/** The Shiftly wordmark: lowercase name, then a brass tick, the same "now" line the timeline draws. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline font-display font-semibold tracking-[-0.04em] lowercase', className)}>
      shiftly
      <span aria-hidden className="ml-[0.12em] inline-block h-[0.78em] w-[0.12em] translate-y-[0.06em] rounded-[1px] bg-primary" />
    </span>
  )
}
