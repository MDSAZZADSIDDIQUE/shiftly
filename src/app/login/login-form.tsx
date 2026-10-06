'use client'

import { useActionState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/lib/actions/auth'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {})
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Sign in
      </Button>
    </form>
  )
}
