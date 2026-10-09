'use client'

import { Field, NativeSelect } from '@/components/forms'

export type BranchOption = { id: string; name: string }

/**
 * Picks the branch a shift or usual-week slot is at (form field "branch_id"). A business with one branch doesn't
 * see it; the branch is sent anyway.
 */
export function BranchField({
  branches,
  label = 'Branch',
  name = 'branch_id',
  value,
  defaultValue,
  onChange,
}: {
  branches: BranchOption[]
  label?: string
  name?: string
  value?: string
  defaultValue?: string | null
  onChange?: (id: string) => void
}) {
  if (branches.length === 1) return <input type="hidden" name={name} value={branches[0].id} />
  if (branches.length === 0) return null
  return (
    <Field label={label}>
      <NativeSelect
        name={name}
        {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? '' })}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="">No {label.toLowerCase()}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  )
}
