# Shiftly

Fingerprint clock in / clock out for a UK store. A cloud-connected (Wi-Fi / 4G) fingerprint terminal sends every scan to this app; the manager sees who's in, how long everyone worked, sets paid hours, assigns shifts, books holidays and gets wages for any period.

This repo is the **manager web app**. The employee mobile app comes later and will use the same Supabase backend (row level security already lets employees read only their own data and request holidays).

## Stack

- **Next.js 16** (App Router, Server Actions) + **Tailwind CSS 4** + **shadcn/ui** (Base UI) + **Recharts**
- **Supabase**: Postgres, Auth, Row Level Security, Realtime (live dashboard)
- **ZKTeco ADMS / Push protocol** endpoint at `/iclock/*` for the fingerprint terminal
- Docker Compose + Caddy with self-hosted Supabase for deployment (Oracle Cloud Always Free for the demo)

## How time is calculated

- Every scan is stored in `punches` (never edited). A database trigger turns scans into `attendance_sessions`: the first scan clocks in, the next clocks out. Repeat scans within 60 seconds are ignored; a session left open for 16 hours is flagged as a missed clock out.
- **Worked** = actual time between clock in and clock out, e.g. `5h 12m 13s`.
- **Paid hours** for a day = the hours the manager set for that day, otherwise the employee's usual hours per day (capped at time actually worked), otherwise the actual time worked.
- **Wages** = paid hours × the hourly rate in effect on that day (rates have start dates, so a pay rise never changes past wages). Gross only; export the CSV to your payroll software for PAYE.
- All times are stored in UTC and shown in UK time (`Europe/London`), so BST changes are handled.

## Setup

### 1. Supabase

1. Create a project (choose the **London** region).
2. Apply the schema, either:
   - `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`, or
   - paste `supabase/migrations/20261006000000_init.sql` into the SQL editor and run it.
3. Optional demo data: run `supabase/seed.sql` in the SQL editor (see [Demo data](#demo-data); it also creates sign-in accounts).
4. Without the demo data: **Authentication → Users → Add user** to create the manager login. The first account created becomes the manager.
5. **Authentication → Sign In / Providers**: turn off "Allow new users to sign up" so nobody else can register.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API Keys**. `SUPABASE_SECRET_KEY` is only used on the server, by the fingerprint terminal endpoint.

### 3. Run locally

```bash
npm install
npm run dev
```

Without a terminal you can still demo everything: the **Clock in / Clock out** buttons on the dashboard create the same scans the terminal would.

To test the terminal endpoint by hand (the terminal must be enabled on the Devices page):

```bash
curl "http://localhost:3000/iclock/cdata?SN=TEST001"   # handshake; the terminal appears on the Devices page
curl -X POST "http://localhost:3000/iclock/cdata?SN=TEST001&table=ATTLOG" \
  --data-binary $'1\t2026-10-06 09:00:00\t0\t1\t0\t0\t0'
```

### Demo data

`supabase/seed.sql` sets up Parkway Pharmacy for client demos: a community pharmacy team of eleven plus one leaver (pharmacists, a trainee, a technician, dispensers, counter assistants and delivery drivers), with a pharmacist rota'd for every opening hour, eight weeks of fingerprint scans, a rota for the next fortnight, pay rates with this year's National Living Wage rise, holidays (approved, pending, declined, cancelled), manager overrides, two terminals and a few things to point at: a missed clock out, a session the manager fixed, a manual clock in, a duplicate scan and an unrecognised finger.

All dates are relative to when the seed runs, so **reseed shortly before each demo, during opening hours (08:30–17:30 UK)**. That way the dashboard shows people mid-shift, one person late and one on holiday:

```bash
npx supabase db reset
```

To run against the local database (Docker), start Supabase with `npx supabase start`, put its URL and keys (`npx supabase status`) in `.env.supabase-local`, and use the `shiftly-local` launch config (port 3001). `NEXT_PUBLIC_STORE_NAME` in that file sets the store name.

Sign-in accounts (all use the password `shiftly-demo-2026`):

| Email | Role | Opens |
| --- | --- | --- |
| `sarah.mitchell@example.co.uk` | Manager | Dashboard, rota, wages, devices |
| `amira@example.co.uk` | Employee (store supervisor) | Employee app `/me` |
| `tom@example.co.uk` | Employee | `/me` |
| `priya@example.co.uk` | Employee | `/me` |
| `chloe@example.co.uk` | Employee | `/me` |

The password is public. If you seed a database that anyone else can reach, change these passwords or delete the accounts afterwards.

## Deploy on Oracle Cloud (Always Free)

The demo runs at **https://shiftly.softilo.co.uk** on the shared Oracle VM (Ampere ARM64, Ubuntu 24.04) that also hosts the Softilo sites. Everything Shiftly needs runs in one Docker Compose project, `shiftly`:

- **Self-hosted Supabase**: Postgres, Auth, PostgREST and Realtime, the same versions the Supabase CLI uses locally. The database is not reachable from outside the VM.
- **The app** (Next.js standalone build).
- **A small Caddy gateway** on `127.0.0.1:3600`. It routes `/auth/v1`, `/rest/v1` and `/realtime/v1` to Supabase and everything else to the app, so the app and its Supabase API share one domain.

The VM's own Caddy terminates HTTPS for the domain and proxies to the gateway (`/etc/caddy/sites/shiftly.caddy`). It also answers `/iclock/*` on plain HTTP port 80 for fingerprint terminals, so no extra firewall ports are needed. Secrets are generated on the server in `/etc/shiftly/shiftly.env` and never leave it; the code and compose files live in `/opt/shiftly`.

**First time** (the VM already has Docker and Caddy):

1. Point the domain at the VM: in Porkbun, add an **A** record for `shiftly` → the VM's public IP.
2. Generate secrets on the server:
   ```bash
   ssh ubuntu@<vm> "sudo DOMAIN=shiftly.softilo.co.uk bash -s" < deploy/setup-server.sh
   ```
3. Build and start everything, loading the demo data:
   ```bash
   SERVER=ubuntu@<vm> SSH_KEY=~/.ssh/<key> SEED=1 bash deploy/deploy.sh
   ```
4. Once DNS resolves, turn on HTTPS through the host's Caddy (it validates the config before reloading):
   ```bash
   ssh ubuntu@<vm> "sudo DOMAIN=shiftly.softilo.co.uk WITH_CADDY=1 bash -s" < deploy/setup-server.sh
   ```

**Updating**: run step 3 again without `SEED=1`. It uploads the working tree, rebuilds the app, applies any new files in `supabase/migrations/` (tracked in `supabase_migrations.schema_migrations`, as the Supabase CLI does) and restarts what changed.

**Fresh demo data before a client demo**: `RESEED=1` wipes all data and accounts on the server and loads `supabase/seed.sql` again:

```bash
SERVER=ubuntu@<vm> SSH_KEY=~/.ssh/<key> RESEED=1 bash deploy/deploy.sh
```

**On the server**, `cd /opt/shiftly` and use `sudo docker compose ...` (`ps`, `logs app`, `exec db psql -U postgres`). The demo accounts and their public password are in [Demo data](#demo-data). Without SMTP, sign-up is disabled and accounts are confirmed on creation; add staff logins as the manager or in SQL.

## Fingerprint terminal

Any ZKTeco model with **ADMS / Cloud Server** support (Wi-Fi or 4G versions) works. Fingerprint templates stay on the terminal; only "user 12 scanned at 09:01:33" reaches the server. Unknown terminals are recorded but ignored until the manager ticks **Accept scans**.

Access-control terminals such as the F22 use push protocol 3.x (`/iclock/registry`, `/iclock/push`, `/iclock/ping`) and upload door events as `table=rtlog`. Only successful identifications become punches; door state, alarms and denied scans are skipped. Every terminal request is logged as an `[iclock]` line (`docker compose logs app | grep iclock` on the server), and uploads in a table Shiftly doesn't know are refused so the terminal keeps them.

The push endpoints `/iclock/*` also answer on plain HTTP (port 80) because many terminals cannot do HTTPS. Everything else redirects to HTTPS.

### UK GDPR

Fingerprints are special category biometric data. Before going live, write a short DPIA and offer staff a non-biometric alternative (PIN or card on the same terminal), which this app handles the same way.

## Project layout

```
supabase/migrations/   schema, punch pairing trigger, reports, RLS
supabase/seed.sql      demo data
src/app/(app)/         dashboard, attendance, calendar, employees, holidays, wages, devices
src/app/iclock/        fingerprint terminal push endpoint
src/lib/actions/       server actions (all writes go through RLS as the signed-in manager)
deploy/                Docker Compose (self-hosted Supabase + app + gateway) and deploy scripts for a single VM
```
