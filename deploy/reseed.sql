-- Clears all app data and sign-in accounts so supabase/seed.sql can run again (deploy.sh with RESEED=1).
-- Demo servers only: this deletes everything.

truncate public.employees, public.devices, public.audit_log, public.profiles restart identity cascade;
delete from auth.users;
