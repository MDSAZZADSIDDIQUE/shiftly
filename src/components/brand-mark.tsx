import { FingerprintIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The Shiftly logo tile, shared by the sidebar and the sign-in page. */
export function BrandMark({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center bg-ink text-brass-bright shadow-[inset_0_1px_0_oklch(1_0_0/0.08)] ring-1 ring-foreground/10',
        size === 'md' && 'size-9 rounded-xl [&_svg]:size-5',
        size === 'lg' && 'size-12 rounded-2xl [&_svg]:size-7',
        className
      )}
    >
      <FingerprintIcon />
    </span>
  )
}
