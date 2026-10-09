'use client'

import { useOptimistic, useTransition } from 'react'
import { ChevronsUpDownIcon, Loader2Icon, MapPinIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { selectBranch } from '@/lib/actions/branch'
import { cn, plural } from '@/lib/utils'

const ALL = 'all'

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
  // Show the new choice straight away while the pages reload for it.
  const [current, setCurrent] = useOptimistic(selectedId ?? ALL)
  if (branches.length < 2) return null

  const all = `All ${plural(branchWord)}`
  const label = branches.find((b) => b.id === current)?.name ?? all

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-sm transition-colors outline-none',
          'hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-sidebar-accent'
        )}
      >
        {pending ? (
          <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value: string) =>
            startTransition(async () => {
              setCurrent(value)
              await selectBranch(value === ALL ? '' : value)
            })
          }
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuRadioItem value={ALL} closeOnClick>{all}</DropdownMenuRadioItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {branches.map((b) => (
            <DropdownMenuRadioItem key={b.id} value={b.id} closeOnClick>
              <MapPinIcon className="text-muted-foreground" />
              {b.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
