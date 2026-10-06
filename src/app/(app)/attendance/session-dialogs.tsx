'use client'

import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { ActionButton, Field, FormDialog } from '@/components/forms'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/types'

type Action = (form: FormData) => Promise<ActionResult>

export function SetHoursDialog({
  name,
  action,
  current,
  defaultMinutes,
  workedLabel,
}: {
  name: string
  action: Action
  current: number | null
  defaultMinutes: number | null
  workedLabel: string
}) {
  const toInput = (m: number | null) => (m == null ? '' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`)
  return (
    <FormDialog
      title={`Paid hours for ${name}`}
      description={`Actually worked: ${workedLabel}. Leave empty to use the default${defaultMinutes != null ? ` (${toInput(defaultMinutes)})` : ' (actual time worked)'}.`}
      trigger={{ label: <PencilIcon />, size: 'icon-xs', variant: 'ghost', className: 'reveal', ariaLabel: `Set paid hours for ${name}` }}
      action={action}
      successMessage="Hours saved"
    >
      <Field label="Hours to pay" hint="e.g. 5, 4.5 or 4:30">
        <Input name="hours" defaultValue={toInput(current)} placeholder={toInput(defaultMinutes) || 'Actual time'} autoFocus />
      </Field>
      <Field label="Note (optional)">
        <Input name="note" placeholder="e.g. Agreed to leave early" />
      </Field>
    </FormDialog>
  )
}

export function SessionDialog({
  mode,
  action,
  deleteAction,
  date,
  clockIn,
  clockOut,
  note,
}: {
  mode: 'add' | 'edit'
  action: Action
  deleteAction?: () => Promise<ActionResult>
  date: string
  clockIn?: string
  clockOut?: string
  note?: string | null
}) {
  return (
    <FormDialog
      title={mode === 'add' ? 'Add clock in / out' : 'Edit clock in / out'}
      description="Times are UK time. A clock out earlier than the clock in counts as the next day."
      trigger={
        mode === 'add'
          ? { label: <><PlusIcon /> Add time</>, size: 'xs', variant: 'ghost', className: 'reveal text-muted-foreground' }
          : { label: <PencilIcon />, size: 'icon-xs', variant: 'ghost', className: 'reveal', ariaLabel: 'Edit clock in / out' }
      }
      action={action}
      successMessage="Saved"
    >
      <Field label="Date">
        <Input type="date" name="date" defaultValue={date} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Clock in">
          <Input type="time" name="clock_in" defaultValue={clockIn} required />
        </Field>
        <Field label="Clock out">
          <Input type="time" name="clock_out" defaultValue={clockOut} />
        </Field>
      </div>
      <Field label="Reason for change">
        <Input name="note" defaultValue={note ?? ''} placeholder="e.g. Forgot to scan out" />
      </Field>
      {deleteAction && (
        <ActionButton type="button" variant="destructive" size="sm" className="justify-self-start" action={deleteAction} confirm="Tap again to delete" successMessage="Deleted">
          <Trash2Icon /> Delete this record
        </ActionButton>
      )}
    </FormDialog>
  )
}
