# Shiftly

Fingerprint clock in / clock out for a UK store. A cloud-connected (Wi-Fi / 4G) fingerprint terminal sends every scan to this app; the manager sees who's in, how long everyone worked, sets paid hours, assigns shifts, books holidays and gets wages for any period.

This repo is the **manager web app**. The employee mobile app comes later and will use the same Supabase backend (row level security already lets employees read only their own data and request holidays).

## Stack

- **Next.js 16** (App Router, Server Actions) + **Tailwind CSS 4** + **shadcn/ui** (Base UI) + **Recharts**
- **Supabase**: Postgres, Auth, Row Level Security, Realtime (live dashboard)
- **ZKTeco ADMS / Push protocol** endpoint at `/iclock/*` for the fingerprint terminal
- Docker + Caddy for deployment (Oracle Cloud Always Free for the demo)

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
3. Optional demo data: run `supabase/seed.sql` in the SQL editor.
4. **Authentication → Users → Add user** to create the manager login. The first account created becomes the manager.
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

## Deploy the demo on Oracle Cloud (Always Free)

1. **Create a VM**: Compute → Instances → Create. Image *Ubuntu 24.04*, shape *VM.Standard.A1.Flex* (Ampere, e.g. 2 OCPU / 12 GB, Always Free eligible). Add your SSH key.
2. **Open ports in Oracle's firewall**: Networking → Virtual Cloud Networks → your VCN → Security Lists → Default → Add Ingress Rules for TCP **80**, **443** and **8080** from `0.0.0.0/0`.
3. **Open the same ports on the VM itself** (Oracle's Ubuntu images block them with iptables):
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp -m multiport --dports 80,443,8080 -j ACCEPT
   sudo netfilter-persistent save
   ```
4. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
5. **Deploy**:
   ```bash
   git clone <this repo> shiftly && cd shiftly/deploy
   cp ../.env.example .env && nano .env
   docker compose up -d --build
   ```
   - `SITE_ADDRESS`: a domain pointing at the VM for automatic HTTPS. With no domain, use the free `sslip.io` name for your IP, e.g. `141-147-1-2.sslip.io` (replace with your public IP, dashes instead of dots). `:80` gives plain HTTP.
   - `DEVICE_SERVER_HOST`: the VM's public IP or domain, as typed into the terminal.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to your dashboard address.
7. Point the terminal at `DEVICE_SERVER_HOST`, port `8080` (Devices page has the steps).

Updating: `git pull && docker compose up -d --build`.

## Fingerprint terminal

Any ZKTeco model with **ADMS / Cloud Server** support (Wi-Fi or 4G versions) works. Fingerprint templates stay on the terminal; only "user 12 scanned at 09:01:33" reaches the server. Unknown terminals are recorded but ignored until the manager ticks **Accept scans**.

Port 8080 serves only `/iclock/*` over plain HTTP because many terminals cannot do HTTPS. The dashboard itself is served over HTTPS.

### UK GDPR

Fingerprints are special category biometric data. Before going live, write a short DPIA and offer staff a non-biometric alternative (PIN or card on the same terminal), which this app handles the same way.

## Project layout

```
supabase/migrations/   schema, punch pairing trigger, reports, RLS
supabase/seed.sql      demo data
src/app/(app)/         dashboard, attendance, calendar, employees, holidays, wages, devices
src/app/iclock/        fingerprint terminal push endpoint
src/lib/actions/       server actions (all writes go through RLS as the signed-in manager)
deploy/                docker compose + Caddy for a single VM
```
