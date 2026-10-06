'use client'

import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A button that reads "6 Oct 2026" whatever the browser's locale, over the browser's own date input.
 * Picking a date submits the surrounding form; typed dates submit on Enter or when the field loses focus.
 * Without JavaScript it is still a plain date input in a GET form.
 */
export function DateField({
  name,
  defaultValue,
  label,
  min,
  max,
  className,
}: {
  name: string
  defaultValue: string
  label: string
  min?: string
  max?: string
  className?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const typed = useRef(false)
  const submit = (input: HTMLInputElement) => {
    if (input.value && input.value !== defaultValue) input.form?.requestSubmit()
  }
  return (
    <label
      className={cn(
        'relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium whitespace-nowrap tabular-nums transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50',
        className
      )}
    >
      <CalendarIcon className="size-4 text-muted-foreground" />
      {value ? format(parseISO(value), 'd MMM yyyy') : 'Pick a date'}
      <input
        type="date"
        name={name}
        value={value}
        min={min}
        max={max}
        aria-label={label}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onClick={(e) => {
          try {
            e.currentTarget.showPicker()
          } catch {
            // Already open, or not supported: the native control still works.
          }
        }}
        onKeyDown={() => {
          typed.current = true
        }}
        onChange={(e) => {
          setValue(e.target.value)
          if (!typed.current) submit(e.target)
        }}
        onBlur={(e) => {
          if (typed.current) submit(e.target)
          typed.current = false
        }}
      />
    </label>
  )
}
