alter table public.projects
  add column if not exists verification_enabled boolean not null default true,
  add column if not exists verification_cadence_minutes integer not null default 15
    check (verification_cadence_minutes between 5 and 1440);

-- The demo is intentionally excluded from the founder's main portfolio.
update public.projects
set verification_enabled = false
where slug = 'sekret-bip-demo';

comment on column public.projects.verification_enabled is
  'Whether the scheduled ManifestController verifies this repository.';
comment on column public.projects.verification_cadence_minutes is
  'Minimum elapsed minutes between completed repository verification runs.';
