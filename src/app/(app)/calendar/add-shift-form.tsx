'use client'

import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { ActionForm, Field, NativeSelect, SubmitButton } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { createShift } from '@/lib/actions/schedule'

type Option = { id: string; name: string; onLeave: boolean; defaultMinutes: number | null }

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function AddShiftForm({ date, employees }: { date: string; employees: Option[] }) {
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [employeeId, setEmployeeId] = useState('')
  const selected = employees.find((e) => e.id === employeeId)

  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <ActionForm
        action={createShift}
        successMessage="Shift added"
        onSuccess={() => setEmployeeId('')}
        className="grid gap-3"
      >
        <input type="hidden" name="date" value={date} />
        <Field label="Assign a shift">
          <NativeSelect
            name="employee_id"
            value={employeeId}
            required
            onChange={(event) => {
              const id = event.target.value
              setEmployeeId(id)
              // Pre-fill the end time from the employee's usual hours.
              const minutes = employees.find((e) => e.id === id)?.defaultMinutes
              if (minutes) setEnd(addMinutes(start, minutes))
            }}
          >
            <option value="">Choose employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.onLeave ? ' (on holiday)' : ''}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {selected?.onLeave && <p className="text-xs text-warning-text">{selected.name} has approved holiday on this day.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <Input type="time" name="start" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field label="End">
            <Input type="time" name="end" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </div>
        <Field label="Note (optional)">
          <Input name="note" placeholder="e.g. Till 2, stock delivery" />
        </Field>
        <SubmitButton className="w-full">
          <PlusIcon /> Add shift
        </SubmitButton>
      </ActionForm>
    </div>
  )
}
