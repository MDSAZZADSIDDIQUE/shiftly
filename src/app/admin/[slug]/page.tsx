import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon, ExternalLinkIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { ActionButton, ActionForm, Field, SubmitButton } from '@/components/forms'
import { PageHeader, Panel } from '@/components/people'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addBranch,
  addManager,
  deleteBranch,
  removeLogo,
  updateBranch,
  updateBusiness,
  uploadLogo,
} from '@/lib/actions/admin'
import { ROOT_DOMAIN, capitalise, logoUrl, type Business, type OpeningHours } from '@/lib/business'
import { createAdminClient } from '@/lib/supabase/admin'
import { plural } from '@/lib/utils'
import { AddManagerForm } from './add-manager-form'

export const metadata: Metadata = { title: 'Business' }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type BranchRow = { id: string; name: string; opening_hours: OpeningHours }

export default async function AdminBusinessPage({ params }: PageProps<'/admin/[slug]'>) {
  const { slug } = await params
  const admin = createAdminClient()!
  const { data: business } = await admin
    .from('businesses')
    .select('id, slug, name, place_word, branch_word, logo_updated_at')
    .eq('slug', slug)
    .maybeSingle<Business>()
  if (!business) notFound()

  const [branchesRes, managersRes, h] = await Promise.all([
    admin.from('branches').select('id, name, opening_hours').eq('business_id', business.id).order('created_at').order('name'),
    admin.from('profiles').select('id, full_name').eq('business_id', business.id).eq('role', 'manager').order('full_name'),
    headers(),
  ])
  const branches = (branchesRes.data ?? []) as BranchRow[]
  const managers = managersRes.data ?? []

  // Where staff sign in: the business's subdomain, on the same protocol and port as this page.
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const port = h.get('host')?.match(/:\d+$/)?.[0] ?? ''
  const signInUrl = `${proto}://${business.slug}.${ROOT_DOMAIN}${port}`
  // The logo route serves the logo of the subdomain it's called on, so preview it from there.
  const logo = logoUrl(business)
  const word = business.branch_word
  const Word = capitalise(word)

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" nativeButton={false} render={<Link href="/admin" />}>
        <ArrowLeftIcon /> Businesses
      </Button>
      <PageHeader
        title={business.name}
        description={`${business.slug}.${ROOT_DOMAIN}`}
        actions={
          <Button variant="outline" nativeButton={false} render={<a href={signInUrl} target="_blank" rel="noreferrer" />}>
            Open <ExternalLinkIcon />
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Name and wording" info="The words appear across their app, e.g. 'Pharmacy closed' on the timeline and 'All branches' in the menu.">
          <ActionForm action={updateBusiness.bind(null, business.id)} successMessage="Saved" className="grid gap-3">
            <Field label="Business name">
              <Input name="name" defaultValue={business.name} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Their premises are a…">
                <Input name="place_word" defaultValue={business.place_word} />
              </Field>
              <Field label="Each location is a…">
                <Input name="branch_word" defaultValue={business.branch_word} />
              </Field>
            </div>
            <SubmitButton className="justify-self-start">Save</SubmitButton>
          </ActionForm>
        </Panel>

        <Panel title="Logo" info="Shown in their sidebar and on their sign-in page. PNG, JPEG, WebP or SVG, up to 512 KB. Square works best.">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-20 items-center justify-center overflow-hidden rounded-xl border bg-white">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${signInUrl}${logo}`} alt={`${business.name} logo`} className="size-full object-contain p-1.5" />
              ) : (
                <span className="text-xs text-zinc-500">No logo</span>
              )}
            </span>
            <ActionForm action={uploadLogo.bind(null, business.id)} successMessage="Logo updated" className="grid flex-1 gap-2">
              <Input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" required />
              <div className="flex gap-2">
                <SubmitButton size="sm">Upload</SubmitButton>
                {logo && (
                  <ActionButton type="button" variant="ghost" size="sm" action={removeLogo.bind(null, business.id)} confirm="Remove?" successMessage="Logo removed">
                    Remove
                  </ActionButton>
                )}
              </div>
            </ActionForm>
          </div>
        </Panel>

        <Panel
          title={capitalise(plural(word))}
          description={`${branches.length} ${branches.length === 1 ? word : plural(word)}`}
          info="Opening hours shade the day timeline. Leave both times empty on a day they're closed."
          className="lg:col-span-2"
        >
          <ul className="grid gap-4 md:grid-cols-2">
            {branches.map((b) => (
              <li key={b.id} className="rounded-xl bg-muted/45 p-4">
                <ActionForm action={updateBranch.bind(null, b.id)} successMessage="Saved" className="grid gap-3">
                  <div className="flex items-end gap-2">
                    <Field label={`${Word} name`}>
                      <Input name="name" defaultValue={b.name} required />
                    </Field>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      action={deleteBranch.bind(null, b.id)}
                      confirm="Delete?"
                      successMessage="Deleted"
                      aria-label={`Delete ${b.name}`}
                      disabled={branches.length <= 1}
                    >
                      <Trash2Icon />
                    </ActionButton>
                  </div>
                  <div className="grid gap-1.5">
                    {DAYS.map((day, i) => {
                      const hours = b.opening_hours[String(i + 1)]
                      return (
                        <div key={day} className="grid grid-cols-[2.5rem_1fr_auto_1fr] items-center gap-1.5">
                          <span className="text-sm">{day}</span>
                          <Input type="time" step={900} name={`opens_${i + 1}`} defaultValue={hours?.[0] ?? ''} aria-label={`${day} opens`} className="px-1.5" />
                          <span className="text-muted-foreground">–</span>
                          <Input type="time" step={900} name={`closes_${i + 1}`} defaultValue={hours?.[1] ?? ''} aria-label={`${day} closes`} className="px-1.5" />
                        </div>
                      )
                    })}
                  </div>
                  <SubmitButton size="sm" variant="secondary" className="justify-self-start">
                    Save {b.name}
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={addBranch.bind(null, business.id)} successMessage={`${Word} added`} className="mt-4 flex flex-wrap items-end gap-2">
            <Field label={`New ${word}`}>
              <Input name="name" required placeholder="e.g. High Street" />
            </Field>
            <SubmitButton variant="secondary">
              <PlusIcon /> Add {word}
            </SubmitButton>
          </ActionForm>
        </Panel>

        <Panel title="Managers" info="Managers run the rota, timesheets, holidays and wages for all of the business's branches." className="lg:col-span-2">
          {managers.length > 0 && (
            <ul className="mb-4 grid gap-1 text-sm">
              {managers.map((m) => (
                <li key={m.id}>{m.full_name}</li>
              ))}
            </ul>
          )}
          <AddManagerForm action={addManager.bind(null, business.id)} signInUrl={signInUrl} />
        </Panel>
      </div>
    </>
  )
}
