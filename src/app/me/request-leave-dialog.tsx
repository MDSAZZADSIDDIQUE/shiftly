'use client'

import { PlusIcon } from 'lucide-react'
import { Field, FormDialog, NativeSelect } from '@/components/forms'
import { Input } from '@/components/ui/input'
import type { ActionResult } from '@/lib/types'

export function RequestLeaveDialog({ action, today }: { action: (form: FormData) => Promise<ActionResult>; today: string }) {
  return (
    <FormDialog
      title="Request time off"
      description="Your manager gets the request on their Holidays page."
      trigger={{ label: <><PlusIcon /> Request time off</>, size: 'sm' }}
      action={action}
      submitLabel="Send request"
      successMessage="Request sent"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="date" name="start_date" min={today} required />
        </Field>
        <Field label="To">
          <Input type="date" name="end_date" min={today} />
        </Field>
      </div>
      <Field label="Type">
        <NativeSelect name="leave_type" defaultValue="annual">
          <option value="annual">Annual leave</option>
          <option value="unpaid">Unpaid</option>
          <option value="other">Other</option>
        </NativeSelect>
      </Field>
      <Field label="Note (optional)">
        <Input name="note" placeholder="e.g. Family wedding" />
      </Field>
    </FormDialog>
  )
}
