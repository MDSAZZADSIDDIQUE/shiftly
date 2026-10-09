'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CopyIcon, Loader2Icon, UserPlusIcon } from 'lucide-react'
import { Field } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NewManager } from '@/lib/actions/admin'

/** Creates a manager's sign-in and shows the one-off password once, to pass on to them. */
export function AddManagerForm({ action, signInUrl }: { action: (form: FormData) => Promise<NewManager>; signInUrl: string }) {
  const [pending, startTransition] = useTransition()
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  if (created) {
    const message = `Sign in at ${signInUrl}\nEmail: ${created.email}\nPassword: ${created.password}`
    return (
      <div className="grid gap-3 rounded-xl border border-dashed p-4 text-sm">
        <p className="font-medium">Account created. Send them these details; the password won&apos;t be shown again.</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{message}</pre>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigator.clipboard.writeText(message).then(() => toast.success('Copied'))}
          >
            <CopyIcon /> Copy
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreated(null)}>
            Add another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        startTransition(async () => {
          const result = await action(form)
          if (result.error) toast.error(result.error)
          else if (result.email && result.password) setCreated({ email: result.email, password: result.password })
        })
      }}
    >
      <Field label="Name">
        <Input name="full_name" placeholder="Sarah Mitchell" disabled={pending} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" required placeholder="sarah@example.co.uk" disabled={pending} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />} Add manager
      </Button>
    </form>
  )
}
