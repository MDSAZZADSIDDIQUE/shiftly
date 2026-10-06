'use client'

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/lib/types'

type Action = (form: FormData) => Promise<ActionResult | void>

const PendingContext = createContext(false)

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  onSuccess,
}: {
  action: Action
  children: ReactNode
  className?: string
  successMessage?: string
  onSuccess?: () => void
}) {
  const [pending, startTransition] = useTransition()
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(async () => {
          const result = await action(data)
          if (result?.error) {
            toast.error(result.error)
            return
          }
          if (successMessage) toast.success(successMessage)
          onSuccess?.()
        })
      }}
    >
      <PendingContext.Provider value={pending}>
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </PendingContext.Provider>
    </form>
  )
}

export function SubmitButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const pending = useContext(PendingContext)
  return (
    <Button type="submit" className={className} disabled={pending} {...props}>
      {pending && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  )
}

/** A button that runs a server action directly (approve, delete, punch…). */
export function ActionButton({
  action,
  children,
  successMessage,
  confirm,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'action'> & {
  action: () => Promise<ActionResult | void>
  successMessage?: string
  confirm?: string
}) {
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        // Two-step confirmation instead of a blocking browser dialog.
        if (confirm && !armed) {
          setArmed(true)
          setTimeout(() => setArmed(false), 3000)
          return
        }
        setArmed(false)
        startTransition(async () => {
          const result = await action()
          if (result?.error) toast.error(result.error)
          else if (successMessage) toast.success(successMessage)
        })
      }}
    >
      {pending && <Loader2Icon className="animate-spin" />}
      {armed ? confirm : children}
    </Button>
  )
}

export function FormDialog({
  title,
  description,
  trigger,
  action,
  submitLabel = 'Save',
  successMessage,
  children,
  wide,
}: {
  title: string
  description?: string
  trigger: { label: ReactNode; variant?: React.ComponentProps<typeof Button>['variant']; size?: React.ComponentProps<typeof Button>['size']; className?: string; ariaLabel?: string }
  action: Action
  submitLabel?: string
  successMessage?: string
  children: ReactNode
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={trigger.variant} size={trigger.size} className={trigger.className} aria-label={trigger.ariaLabel} title={trigger.ariaLabel} />}>
        {trigger.label}
      </DialogTrigger>
      <DialogContent className={cn(wide && 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ActionForm action={action} successMessage={successMessage} onSuccess={() => setOpen(false)}>
          <div className="grid gap-4 pb-4">{children}</div>
          <DialogFooter>
            <SubmitButton>{submitLabel}</SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        className
      )}
      {...props}
    />
  )
}
