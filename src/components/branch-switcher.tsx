'use client'

import { useTransition } from 'react'
import { MapPinIcon } from 'lucide-react'
import { selectBranch } from '@/lib/actions/branch'
import { cn, plural } from '@/lib/utils'

/** Which branch the pages show. Hidden for a business with a single branch. */
export function BranchSwitcher({
  branches,
  selectedId,
  branchWord,
}: {
  branches: { id: string; name: string }[]
  selectedId: string | null
  branchWord: string
}) {
  const [pending, startTransition] = useTransition()
  if (branches.length < 2) return null
  return (
    <label className={cn('relative flex items-center rounded-lg border bg-sidebar-accent/40 text-sm', pending && 'opacity-60')}>
      <MapPinIcon className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <span className="sr-only">Show {branchWord}</span>
      <select
        value={selectedId ?? ''}
        disabled={pending}
        onChange={(e) => startTransition(() => selectBranch(e.target.value))}
        className="w-full appearance-none truncate bg-transparent py-1.5 pr-3 pl-8 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All {plural(branchWord)}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  )
}
