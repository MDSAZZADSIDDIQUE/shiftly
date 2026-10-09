'use client'

import { PencilIcon } from 'lucide-react'
import { Field, FormDialog, NativeSelect } from '@/components/forms'
import { BranchField, type BranchOption } from '@/components/branch-field'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/types'

/** Change who works a shift, its day, times or note. */
export function EditShiftDialog({
  action,
  name,
  employeeId,
  date,
  start,
  end,
  note,
  employees,
  branchId,
  branches,
  branchLabel,
}: {
  action: (form: FormData) => Promise<ActionResult>
  name: string
  employeeId: string
  date: string
  start: string
  end: string
  note: string | null
  employees: { id: string; name: string }[]
  branchId: string | null
  branches: BranchOption[]
  branchLabel: string
}) {
  return (
    <FormDialog
      title="Edit shift"
      description="UK time. An end before the start runs past midnight."
      trigger={{ label: <PencilIcon />, size: 'icon-sm', variant: 'ghost', className: 'reveal', ariaLabel: `Edit ${name}'s shift` }}
      action={action}
      successMessage="Shift updated"
    >
      <Field label="Who">
        <NativeSelect name="employee_id" defaultValue={employeeId} required>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </NativeSelect>
      </Field>
      <BranchField branches={branches} label={branchLabel} defaultValue={branchId} />
      <Field label="Date">
        <Input type="date" name="date" defaultValue={date} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <Input type="time" name="start" defaultValue={start} required />
        </Field>
        <Field label="End">
          <Input type="time" name="end" defaultValue={end} required />
        </Field>
      </div>
      <Field label="Note (optional)">
        <Input name="note" defaultValue={note ?? ''} placeholder="e.g. Till 2, stock delivery" />
      </Field>
    </FormDialog>
  )
}
