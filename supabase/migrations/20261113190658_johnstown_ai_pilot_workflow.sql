begin;

create table public.johnstown_ai_pilot_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('partner', 'participant', 'workflow', 'outcome', 'action')),
  title text not null check (length(trim(title)) between 1 and 180),
  stage text not null check (stage in ('recruit', 'baseline', 'train', 'build', 'handoff', 'measure', 'decide')),
  evidence_state text not null default 'unknown' check (evidence_state in ('confirmed', 'stale', 'unknown')),
  source_url text check (source_url is null or length(source_url) <= 1000),
  review_note text check (review_note is null or length(review_note) <= 4000),
  proof jsonb not null default '{}'::jsonb,
  rollback_note text check (rollback_note is null or length(rollback_note) <= 2000),
  next_gate text not null default 'Record the smallest source-backed next step.' check (length(next_gate) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index johnstown_ai_pilot_records_stage_idx on public.johnstown_ai_pilot_records(stage, updated_at desc);
alter table public.johnstown_ai_pilot_records enable row level security;
revoke all on table public.johnstown_ai_pilot_records from public, anon, authenticated, service_role;
grant select, insert, update on table public.johnstown_ai_pilot_records to service_role;
comment on table public.johnstown_ai_pilot_records is 'Founder-gated 90-day Johnstown AI Center pilot records. Separate from facility planning; a success claim requires source-backed proof.';
commit;
