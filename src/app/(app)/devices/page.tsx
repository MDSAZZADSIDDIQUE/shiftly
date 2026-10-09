import type { Metadata } from 'next'
import { formatDistanceToNow } from 'date-fns'
import { FingerprintIcon, PlusIcon, Trash2Icon, WifiIcon, WifiOffIcon } from 'lucide-react'
import { ActionButton, ActionForm, Field, FormDialog, SubmitButton } from '@/components/forms'
import { EmptyState, PageHeader, Panel } from '@/components/people'
import { Input } from '@/components/ui/input'
import { addDevice, deleteDevice, updateDevice } from '@/lib/actions/devices'
import { businessHost, capitalise, getBranches, requireBusiness, type Branch } from '@/lib/business'
import { createClient } from '@/lib/supabase/server'
import type { Device } from '@/lib/types'
import { requestTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Terminals' }

export default async function DevicesPage() {
  const business = await requireBusiness()
  const supabase = await createClient()
  const [{ data }, branches] = await Promise.all([
    supabase.from('devices').select('*').order('created_at'),
    getBranches(business.id),
  ])
  const devices = (data ?? []) as Device[]
  // The terminal calls this business's own subdomain; that's how a new terminal is recorded under it.
  const deviceHost = businessHost(business.slug)
  const devicePort = process.env.DEVICE_SERVER_PORT || '80'
  const secretMissing = !process.env.SUPABASE_SECRET_KEY
  const now = requestTime()

  return (
    <>
      <PageHeader
        title="Terminals"
        actions={
          <FormDialog
            title="Add a terminal"
            description="Enter the serial number from the terminal's System Info screen. It will be trusted as soon as it connects."
            trigger={{ label: <><PlusIcon /> Add terminal</> }}
            action={addDevice}
            successMessage="Terminal added"
          >
            <Field label="Serial number">
              <Input name="serial_number" required placeholder="e.g. CQZ7224160012" />
            </Field>
            <Field label="Name">
              <Input name="name" placeholder="Front door" />
            </Field>
            <Field label={capitalise(business.branch_word)}>
              <BranchSelect branches={branches} defaultValue={branches.length === 1 ? branches[0].id : null} branchWord={business.branch_word} />
            </Field>
          </FormDialog>
        }
      />

      {secretMissing && (
        <div className="tone-rose mb-6 rounded-xl p-3 text-sm">
          <strong>Server not ready for terminals:</strong> set <code>SUPABASE_SECRET_KEY</code> in the server environment so scans can be saved.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <Panel title="Terminals">
          {devices.length === 0 ? (
            <EmptyState icon={<FingerprintIcon />} title="No terminals yet">Set one up with the steps alongside. It shows here once it checks in.</EmptyState>
          ) : (
            <ul className="grid gap-3">
              {devices.map((d) => {
                const online = d.last_seen_at && now - new Date(d.last_seen_at).getTime() < 5 * 60 * 1000
                return (
                  <li key={d.id} className="rise-in group/row rounded-xl bg-muted/45 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="tone-brass relative flex size-11 items-center justify-center rounded-xl">
                        <FingerprintIcon className="size-5" />
                        <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card ${online ? 'bg-success' : 'bg-idle'}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{d.name ?? 'Unnamed terminal'}</p>
                        <p className="text-xs text-muted-foreground">
                          SN {d.serial_number}
                          {d.last_ip && ` · ${d.last_ip}`}
                        </p>
                      </div>
                      {online ? (
                        <span className="tone-emerald inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"><WifiIcon className="size-3" /> Online</span>
                      ) : (
                        <span className="tone-zinc inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                          <WifiOffIcon className="size-3" /> {d.last_seen_at ? `Seen ${formatDistanceToNow(new Date(d.last_seen_at))} ago` : 'Never connected'}
                        </span>
                      )}
                      {!d.enabled && <span className="tone-amber rounded-full px-2 py-0.5 text-xs font-medium">Waiting for approval</span>}
                      {!d.branch_id && branches.length > 1 && (
                        <span className="tone-amber rounded-full px-2 py-0.5 text-xs font-medium">Which {business.branch_word}?</span>
                      )}
                    </div>
                    <ActionForm action={updateDevice.bind(null, d.id)} successMessage="Saved" className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
                      <Input name="name" defaultValue={d.name ?? ''} placeholder="Terminal name, e.g. Front door" aria-label="Terminal name" className="min-w-40 flex-1" />
                      <BranchSelect branches={branches} defaultValue={d.branch_id} branchWord={business.branch_word} className="w-auto min-w-36" />
                      <label className="flex h-8 items-center gap-2 text-sm">
                        <input type="checkbox" name="enabled" defaultChecked={d.enabled} className="size-4 accent-primary" />
                        Accept scans
                      </label>
                      <SubmitButton variant="secondary">Save</SubmitButton>
                      <ActionButton type="button" variant="ghost" size="icon" action={deleteDevice.bind(null, d.id)} confirm="Delete?" aria-label="Delete terminal">
                        <Trash2Icon />
                      </ActionButton>
                    </ActionForm>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Connect a ZKTeco terminal" className="h-fit">
          <ol className="steps grid gap-3 text-sm">
            <li>Connect the terminal to the {business.place_word} Wi-Fi (or insert a 4G SIM).</li>
            <li>
              Open <strong>Menu → COMM → Cloud Server Setting</strong> (called <em>ADMS</em> on some models).
            </li>
            <li>
              <div className="grid gap-1">
                <span>Enter:</span>
                <code className="rounded bg-muted px-2 py-1 text-xs">Server address: {deviceHost}</code>
                <code className="rounded bg-muted px-2 py-1 text-xs">Server port: {devicePort}</code>
                <code className="rounded bg-muted px-2 py-1 text-xs">Enable domain name: {/^\d+\.\d+\.\d+\.\d+$/.test(deviceHost) ? 'OFF' : 'ON'}</code>
              </div>
            </li>
            <li>Set the terminal&apos;s date, time and daylight saving to UK time.</li>
            <li>The terminal appears in the list within a minute. Tick <strong>Accept scans</strong> if it isn&apos;t already trusted.</li>
            <li>Enrol each employee&apos;s fingerprint on the terminal and copy their user ID into their profile.</li>
          </ol>
          <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            Fingerprints stay on the terminal. Only the user ID and time of each scan are sent here. Offer staff a PIN or card as an alternative to fingerprints (UK GDPR).
          </p>
        </Panel>
      </div>
    </>
  )
}

/** Where a terminal is; its clock ins are recorded at that branch. */
function BranchSelect({
  branches,
  defaultValue,
  branchWord,
  className,
}: {
  branches: Branch[]
  defaultValue: string | null
  branchWord: string
  className?: string
}) {
  return (
    <select
      name="branch_id"
      defaultValue={defaultValue ?? ''}
      aria-label={capitalise(branchWord)}
      className={`h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? 'w-full'}`}
    >
      <option value="">Choose {branchWord}…</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )
}
