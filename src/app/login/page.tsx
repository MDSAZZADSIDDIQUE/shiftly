import type { Metadata } from 'next'
import { Ridges } from '@/components/ridges'
import { Wordmark } from '@/components/wordmark'
import { STORE } from '@/lib/store'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand side: ink, with the fingerprint ridges as the only decoration. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-ink-foreground lg:flex xl:p-14">
        <Ridges className="absolute -right-40 -bottom-48 size-[46rem] text-brass-bright/20" />
        <Wordmark className="relative text-2xl [&>span]:bg-brass-bright" />
        <div className="relative">
          <p className="font-display text-5xl leading-none font-light tracking-[-0.03em]">{STORE.name}</p>
          <p className="mt-3 text-ink-muted">Manager sign-in</p>
        </div>
        <p className="relative text-xs text-ink-muted">Fingerprints stay on the terminal. Only the time of each scan is sent.</p>
      </section>

      {/* Form side. */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-10 text-2xl lg:hidden" />
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 mb-8 text-sm text-muted-foreground">{STORE.name}</p>
          <LoginForm />
        </div>
      </section>
    </main>
  )
}
