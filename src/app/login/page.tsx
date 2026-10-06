import type { Metadata } from 'next'
import { BrandMark } from '@/components/brand-mark'
import { Ridges } from '@/components/ridges'
import { STORE } from '@/lib/store'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand side: ink, with the fingerprint ridges as the only decoration. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-ink-foreground lg:flex xl:p-14">
        <Ridges className="absolute -right-40 -bottom-48 size-[46rem] text-brass-bright/20" />
        <div className="relative flex items-center gap-3">
          <BrandMark />
          <span className="font-display text-lg font-semibold tracking-tight">Shiftly</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-5xl leading-[1.05] font-light tracking-[-0.03em] xl:text-6xl">
            Know who&apos;s in, <span className="text-brass-bright">to the second.</span>
          </p>
          <p className="mt-5 text-ink-muted">Fingerprint clock-ins, shifts, holidays and wages for {STORE.name}.</p>
        </div>
        <p className="relative text-xs text-ink-muted">Fingerprints stay on the terminal. Only the time of each scan is sent.</p>
      </section>

      {/* Form side. */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="font-display text-lg font-semibold tracking-tight">Shiftly</span>
          </div>
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 mb-8 text-sm text-muted-foreground">Manage your store&apos;s team.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  )
}
