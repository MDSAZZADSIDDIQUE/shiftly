import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { BuildingIcon, ChevronRightIcon, FingerprintIcon, PlusIcon } from 'lucide-react'
import { ActionForm, Field, FormDialog, NativeSelect, SubmitButton } from '@/components/forms'
import { EmptyState, PageHeader, Panel } from '@/components/people'
import { Input } from '@/components/ui/input'
import { assignDevice, createBusiness } from '@/lib/actions/admin'
import { ROOT_DOMAIN } from '@/lib/business'
import { createAdminClient } from '@/lib/supabase/admin'
import { plural } from '@/lib/utils'

export const metadata: Metadata = { title: 'Businesses' }

type Row = {
  id: string
  slug: string
  name: string
  branch_word: string
  branches: { id: string; name: string }[]
  employees: { count: number }[]
}

export default async function AdminPage() {
  const admin = createAdminClient()!
  const [businessesRes, devicesRes, h] = await Promise.all([
    admin.from('businesses').select('id, slug, name, branch_word, branches(id, name), employees(count)').order('name'),
    admin.from('devices').select('id, serial_number, last_ip, last_seen_at').is('business_id', null).order('last_seen_at', { ascending: false }),
    headers(),
  ])
  const businesses = (businessesRes.data ?? []) as Row[]
  const loose = devicesRes.data ?? []
  const port = h.get('host')?.match(/:\d+$/)?.[0] ?? ''

  return (
    <>
      <PageHeader
        title="Businesses"
        description={`Each business has its own address under ${ROOT_DOMAIN}.`}
        actions={
          <FormDialog title="New business" trigger={{ label: <><PlusIcon /> New business</> }} action={createBusiness} submitLabel="Create" wide>
            <Field label="Business name">
              <Input name="name" required placeholder="Parkway Pharmacy" autoFocus />
            </Field>
            <Field label="Address" hint={`Staff sign in at <address>.${ROOT_DOMAIN}`}>
              <Input name="slug" required placeholder="parkway" pattern="[a-z0-9-]+" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Their premises are a…" hint="e.g. shop, pharmacy, café">
                <Input name="place_word" placeholder="shop" />
              </Field>
              <Field label="Each location is a…" hint="e.g. branch, store, site">
                <Input name="branch_word" placeholder="branch" />
              </Field>
            </div>
            <Field label="First branch">
              <Input name="first_branch" placeholder="Main branch" />
            </Field>
          </FormDialog>
        }
      />

      <div className="grid gap-6">
        <Panel title="Businesses">
          {businesses.length === 0 ? (
            <EmptyState icon={<BuildingIcon />} title="No businesses yet">Create one to give a customer their own address.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {businesses.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/${b.slug}`} className="flex items-center gap-3 rounded-xl bg-muted/45 p-4 transition-colors hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.slug}.{ROOT_DOMAIN}
                        {port} · {b.branches.length} {b.branches.length === 1 ? b.branch_word : plural(b.branch_word)} ·{' '}
                        {b.employees[0]?.count ?? 0} staff
                      </p>
                    </div>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {loose.length > 0 && (
          <Panel
            title="Terminals without a business"
            info="These called the bare domain instead of a business's own address. Give each one to the branch it is at, or point it at the business's address."
          >
            <ul className="grid gap-3">
              {loose.map((d) => (
                <li key={d.id} className="rounded-xl bg-muted/45 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <FingerprintIcon className="size-4" /> SN {d.serial_number}
                    <span className="font-normal text-muted-foreground">{d.last_ip}</span>
                  </p>
                  <ActionForm action={assignDevice.bind(null, d.id)} successMessage="Terminal assigned" className="mt-3 flex flex-wrap gap-2">
                    <NativeSelect name="branch_id" required defaultValue="" className="w-auto min-w-56 flex-1">
                      <option value="">Choose a business and branch…</option>
                      {businesses.map((b) => (
                        <optgroup key={b.id} label={b.name}>
                          {b.branches.map((br) => (
                            <option key={br.id} value={br.id}>
                              {br.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                    <SubmitButton variant="secondary">Assign</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  )
}
