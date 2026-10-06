import { cn } from '@/lib/utils'

/**
 * Fingerprint ridges drawn as broken concentric loops: the brand's one texture.
 * Decorative only; colour comes from `currentColor`, size from the container.
 * The breaks are derived from the ring number, so server and client render the same.
 */
export function Ridges({ rings = 22, strokeWidth = 0.6, className }: { rings?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={cn('pointer-events-none', className)}
      aria-hidden
    >
      {Array.from({ length: rings }, (_, i) => {
        const k = i + 1
        const step = 92 / rings
        return (
          <ellipse
            key={k}
            cy={-k * 0.7}
            rx={k * step * 0.82}
            ry={k * step}
            pathLength={100}
            strokeDasharray={`${52 + ((k * 23) % 40)} ${3 + ((k * 7) % 6)}`}
            strokeDashoffset={(k * 37) % 100}
          />
        )
      })}
    </svg>
  )
}
