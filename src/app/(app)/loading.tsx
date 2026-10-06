import { Skeleton } from '@/components/ui/skeleton'

/** Shown while a page's data loads, so navigation never flashes a blank screen. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  )
}
