'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CopyIcon, Loader2Icon, WandSparklesIcon } from 'lucide-react'
import { Field, NativeSelect } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { copyWeek, fillRota, undoShifts, type BulkResult } from '@/lib/actions/rota'

/** A dialog that adds many shifts, then reports what it did with an Undo in the toast. */
function BulkDialog({
  title,
  description,
  trigger,
  submitLabel,
  action,
  children,
}: {
  title: string
  description: string
  trigger: ReactNode
  submitLabel: string
  action: (form: FormData) => Promise<BulkResult>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            startTransition(async () => {
              const result = await action(data)
              if (result.error) {
                toast.error(result.error)
                return
              }
              setOpen(false)
              const ids = result.created ?? []
              toast.success(result.message ?? 'Done', {
                duration: ids.length ? 12000 : undefined,
                action: ids.length
                  ? {
                      label: 'Undo',
                      onClick: async () => {
                        const undone = await undoShifts(ids)
                        if (undone.error) toast.error(undone.error)
                        else toast.success(`Removed ${ids.length} shift${ids.length === 1 ? '' : 's'}`)
                      },
                    }
                  : undefined,
              })
            })
          }}
        >
          <fieldset disabled={pending} className="contents">
            <div className="grid gap-4 pb-4">{children}</div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FillRotaDialog({
  from,
  to,
  people,
}: {
  from: string
  to: string
  /** Staff who have a usual week set. */
  people: { id: string; name: string }[]
}) {
  return (
    <BulkDialog
      title="Fill rota"
      description="Adds shifts from each person's usual week. Holidays and shifts already on the rota are left alone."
      trigger={<><WandSparklesIcon /> Fill rota</>}
      submitLabel="Fill rota"
      action={fillRota}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="date" name="from" defaultValue={from} min={from} required />
        </Field>
        <Field label="To">
          <Input type="date" name="to" defaultValue={to} min={from} required />
        </Field>
      </div>
      <Field label="Who" hint={people.length === 0 ? 'Nobody has a usual week yet. Set one on each staff profile.' : undefined}>
        <NativeSelect name="employee_id" defaultValue="">
          <option value="">Everyone with a usual week ({people.length})</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </NativeSelect>
      </Field>
    </BulkDialog>
  )
}

export function CopyWeekDialog({ week, label, shifts }: { week: string; label: string; shifts: number }) {
  return (
    <BulkDialog
      title={`Copy ${label}`}
      description={`Copies this week's ${shifts} shift${shifts === 1 ? '' : 's'} forward. Holidays and shifts already on the rota are left alone.`}
      trigger={<><CopyIcon /> Copy week</>}
      submitLabel="Copy"
      action={copyWeek}
    >
      <input type="hidden" name="week" value={week} />
      <Field label="Copy to">
        <NativeSelect name="weeks" defaultValue="1">
          <option value="1">Next week</option>
          <option value="2">The next 2 weeks</option>
          <option value="3">The next 3 weeks</option>
          <option value="4">The next 4 weeks</option>
        </NativeSelect>
      </Field>
    </BulkDialog>
  )
}
