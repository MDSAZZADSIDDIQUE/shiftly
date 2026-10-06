'use client'

import { PlusIcon } from 'lucide-react'
import { Field, FormDialog, NativeSelect } from '@/components/forms'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/types'

export function BookLeaveDialog({
  action,
  employees,
}: {
  action: (form: FormData) => Promise<ActionResult>
  employees: { id: string; name: string }[]
}) {
  return (
    <FormDialog
      title="Book holiday"
      description="Holiday you book is approved straight away."
      trigger={{ label: <><PlusIcon /> Book holiday</> }}
      action={action}
      submitLabel="Book"
      successMessage="Holiday booked"
    >
      <Field label="Employee">
        <NativeSelect name="employee_id" required defaultValue="">
          <option value="" disabled>Choose employee…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="date" name="start_date" required />
        </Field>
        <Field label="To">
          <Input type="date" name="end_date" />
        </Field>
      </div>
      <Field label="Type">
        <NativeSelect name="leave_type" defaultValue="annual">
          <option value="annual">Annual leave</option>
          <option value="sick">Sick</option>
          <option value="unpaid">Unpaid</option>
          <option value="other">Other</option>
        </NativeSelect>
      </Field>
      <Field label="Note (optional)">
        <Input name="note" />
      </Field>
    </FormDialog>
  )
}
