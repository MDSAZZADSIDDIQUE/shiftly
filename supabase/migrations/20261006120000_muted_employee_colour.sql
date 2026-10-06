-- New employees default to the first colour of the muted palette (src/lib/store.ts).
alter table public.employees alter column color set default '#4f6d8f';
