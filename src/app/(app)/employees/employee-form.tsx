'use client'

import { PencilIcon, PlusIcon } from 'lucide-react'
import { Field, FormDialog } from '@/components/forms'
import { Input } from '@/components/ui/input'
import type { ActionResult, Employee } from '@/lib/types'
import { PALETTE } from '@/lib/store'

const COLORS = PALETTE

function hoursInput(minutes: number | null | undefined) {
  if (minutes == null) return ''
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

function Fields({ employee, withRate }: { employee?: Employee; withRate?: boolean }) {
  return (
    <>
      <Field label="Full name">
        <Input name="full_name" defaultValue={employee?.full_name} required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job title">
          <Input name="job_title" defaultValue={employee?.job_title ?? ''} placeholder="Sales assistant" />
        </Field>
        <Field label="Start date">
          <Input type="date" name="started_on" defaultValue={employee?.started_on ?? ''} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <Input type="email" name="email" defaultValue={employee?.email ?? ''} />
        </Field>
        <Field label="Phone">
          <Input type="tel" name="phone" defaultValue={employee?.phone ?? ''} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fingerprint user ID" hint="The user number on the terminal">
          <Input name="device_user_id" defaultValue={employee?.device_user_id ?? ''} placeholder="e.g. 12" inputMode="numeric" />
        </Field>
        <Field label="Usual hours a day" hint="e.g. 5 or 4:30. Leave empty to pay time worked.">
          <Input name="daily_hours" defaultValue={hoursInput(employee?.daily_minutes)} placeholder="5" />
        </Field>
      </div>
      {withRate && (
        <Field label="Hourly rate (£)" hint="You can change this later; old rates are kept for past wages.">
          <Input name="hourly_rate" inputMode="decimal" placeholder="12.71" />
        </Field>
      )}
      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c}
                defaultChecked={employee ? employee.color === c : i === 0}
                className="peer sr-only"
              />
              <span
                className="block size-7 rounded-full ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                style={{ backgroundColor: c }}
              />
            </label>
          ))}
        </div>
      </Field>
      {employee && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={employee.active} className="size-4 accent-primary" />
          Currently employed
        </label>
      )}
    </>
  )
}

export function AddEmployeeDialog({ action }: { action: (form: FormData) => Promise<ActionResult> }) {
  return (
    <FormDialog
      title="Add staff"
      description="Enrol their fingerprint on the terminal, then enter the user ID it shows here."
      trigger={{ label: <><PlusIcon /> Add staff</> }}
      action={action}
      submitLabel="Add employee"
      successMessage="Added"
      wide
    >
      <Fields withRate />
    </FormDialog>
  )
}

export function EditEmployeeDialog({ employee, action }: { employee: Employee; action: (form: FormData) => Promise<ActionResult> }) {
  return (
    <FormDialog
      title={`Edit ${employee.full_name}`}
      trigger={{ label: <><PencilIcon /> Edit</>, variant: 'outline' }}
      action={action}
      successMessage="Saved"
      wide
    >
      <Fields employee={employee} />
    </FormDialog>
  )
}
