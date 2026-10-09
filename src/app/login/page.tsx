import type { Metadata } from 'next'
import { Ridges } from '@/components/ridges'
import { Wordmark } from '@/components/wordmark'
import { getBusiness, logoUrl } from '@/lib/business'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Each business signs in on its own subdomain; the bare domain is the platform admin's sign-in.
  const business = await getBusiness()
  const name = business?.name ?? 'Shiftly admin'
  const logo = business ? logoUrl(business) : null
  const { error } = await searchParams
  const notice = error === 'other-business' ? `Sign in with your ${name} account.` : undefined

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand side: ink, with the fingerprint ridges as the only decoration. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-ink-foreground lg:flex xl:p-14">
        <Ridges className="absolute -right-40 -bottom-48 size-[46rem] text-brass-bright/20" />
        <Wordmark className="relative text-2xl [&>span]:bg-brass-bright" />
        <div className="relative">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="mb-6 size-20 rounded-xl bg-white object-contain p-2" />
          )}
          <p className="font-display text-5xl leading-none font-light tracking-[-0.03em]">{name}</p>
          <p className="mt-3 text-ink-muted">{business ? 'Staff sign-in' : 'Set up businesses, branches and branding'}</p>
        </div>
        <p className="relative text-xs text-ink-muted">Fingerprints stay on the terminal. Only the time of each scan is sent.</p>
      </section>

      {/* Form side. */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-10 rounded-lg bg-white object-contain p-1" />
            )}
            <Wordmark className="text-2xl" />
          </div>
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 mb-8 text-sm text-muted-foreground">{name}</p>
          <LoginForm notice={notice} />
        </div>
      </section>
    </main>
  )
}
