-- City-agnostic economic intelligence schema.
-- This lives in the standalone Founder Control Room trust boundary.
-- No teen, journal, voice, media, parent, credential, or private product content belongs here.

create table if not exists economic_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_jurisdiction_id uuid references economic_jurisdictions(id) on delete set null,
  slug text not null,
  name text not null,
  jurisdiction_type text not null check (jurisdiction_type in (
    'city', 'county', 'region', 'state', 'tribal', 'other'
  )),
  country_code text not null check (char_length(country_code) = 2),
  subdivision_code text,
  timezone text not null,
  config jsonb not null default '{}'::jsonb,
  data_classification text not null default 'verified_public' check (data_classification in (
    'verified_public', 'synthetic_verification_fixture', 'founder_operational'
  )),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table if not exists economic_organizations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  primary_jurisdiction_id uuid references economic_jurisdictions(id) on delete set null,
  name text not null,
  organization_type text not null check (organization_type in (
    'government', 'business', 'nonprofit', 'education', 'healthcare', 'foundation', 'other'
  )),
  website text,
  external_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, external_key)
);

create table if not exists economic_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  jurisdiction_id uuid references economic_jurisdictions(id) on delete set null,
  publisher_organization_id uuid references economic_organizations(id) on delete set null,
  source_key text not null,
  title text not null,
  source_type text not null check (source_type in (
    'official_document', 'official_dataset', 'public_notice', 'program_page',
    'market_signal', 'procurement', 'survey', 'manual_verified', 'other'
  )),
  url text,
  published_at timestamptz,
  observed_at timestamptz not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, source_key)
);

create table if not exists economic_programs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  jurisdiction_id uuid references economic_jurisdictions(id) on delete set null,
  owner_organization_id uuid references economic_organizations(id) on delete set null,
  name text not null,
  program_type text not null,
  authority_level text not null check (authority_level in (
    'federal', 'state', 'county', 'municipal', 'regional', 'private', 'other'
  )),
  eligibility_rules jsonb not null default '{}'::jsonb,
  application_url text,
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'active' check (status in ('draft', 'active', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists economic_program_sources (
  program_id uuid not null references economic_programs(id) on delete cascade,
  source_id uuid not null references economic_sources(id) on delete cascade,
  primary key (program_id, source_id)
);

create table if not exists economic_opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  jurisdiction_id uuid not null references economic_jurisdictions(id) on delete cascade,
  title text not null,
  category text not null,
  description text,
  status text not null default 'observing' check (status in (
    'observing', 'qualified', 'prioritized', 'piloting', 'measuring', 'closed', 'rejected'
  )),
  signal_snapshot jsonb not null default '{}'::jsonb,
  current_score numeric(5,2),
  score_version text,
  data_classification text not null default 'founder_operational' check (data_classification in (
    'verified_public', 'synthetic_verification_fixture', 'founder_operational'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists economic_opportunity_sources (
  opportunity_id uuid not null references economic_opportunities(id) on delete cascade,
  source_id uuid not null references economic_sources(id) on delete cascade,
  primary key (opportunity_id, source_id)
);

create table if not exists economic_opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references economic_opportunities(id) on delete cascade,
  signals jsonb not null,
  weights jsonb not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  score_band text not null check (score_band in (
    'priority', 'promising', 'monitor', 'insufficient_evidence'
  )),
  score_version text not null,
  scored_at timestamptz not null default now()
);

create table if not exists economic_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  jurisdiction_id uuid not null references economic_jurisdictions(id) on delete cascade,
  opportunity_id uuid references economic_opportunities(id) on delete set null,
  program_id uuid references economic_programs(id) on delete set null,
  source_id uuid references economic_sources(id) on delete set null,
  metric_key text not null,
  metric_value numeric,
  metric_text text,
  unit text,
  observed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (metric_value is not null or metric_text is not null)
);

create index if not exists economic_jurisdictions_project_idx
  on economic_jurisdictions (project_id, status);
create index if not exists economic_sources_jurisdiction_observed_idx
  on economic_sources (jurisdiction_id, observed_at desc);
create index if not exists economic_programs_jurisdiction_status_idx
  on economic_programs (jurisdiction_id, status);
create index if not exists economic_opportunities_jurisdiction_score_idx
  on economic_opportunities (jurisdiction_id, current_score desc nulls last);
create index if not exists economic_opportunity_scores_latest_idx
  on economic_opportunity_scores (opportunity_id, scored_at desc);
create index if not exists economic_outcomes_jurisdiction_metric_idx
  on economic_outcomes (jurisdiction_id, metric_key, observed_at desc);

alter table economic_jurisdictions enable row level security;
alter table economic_organizations enable row level security;
alter table economic_sources enable row level security;
alter table economic_programs enable row level security;
alter table economic_program_sources enable row level security;
alter table economic_opportunities enable row level security;
alter table economic_opportunity_sources enable row level security;
alter table economic_opportunity_scores enable row level security;
alter table economic_outcomes enable row level security;

revoke all on economic_jurisdictions from anon, authenticated;
revoke all on economic_organizations from anon, authenticated;
revoke all on economic_sources from anon, authenticated;
revoke all on economic_programs from anon, authenticated;
revoke all on economic_program_sources from anon, authenticated;
revoke all on economic_opportunities from anon, authenticated;
revoke all on economic_opportunity_sources from anon, authenticated;
revoke all on economic_opportunity_scores from anon, authenticated;
revoke all on economic_outcomes from anon, authenticated;

grant all on economic_jurisdictions to service_role;
grant all on economic_organizations to service_role;
grant all on economic_sources to service_role;
grant all on economic_programs to service_role;
grant all on economic_program_sources to service_role;
grant all on economic_opportunities to service_role;
grant all on economic_opportunity_sources to service_role;
grant all on economic_opportunity_scores to service_role;
grant all on economic_outcomes to service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'economic_jurisdictions_set_updated_at') then
    create trigger economic_jurisdictions_set_updated_at
      before update on economic_jurisdictions
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'economic_organizations_set_updated_at') then
    create trigger economic_organizations_set_updated_at
      before update on economic_organizations
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'economic_programs_set_updated_at') then
    create trigger economic_programs_set_updated_at
      before update on economic_programs
      for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'economic_opportunities_set_updated_at') then
    create trigger economic_opportunities_set_updated_at
      before update on economic_opportunities
      for each row execute function set_updated_at();
  end if;
end
$$;

comment on table economic_jurisdictions is
  'Provider-neutral jurisdiction registry. City identity is data, never schema.';
comment on table economic_sources is
  'Source provenance for every economic claim; no raw private product or user content.';
comment on table economic_opportunity_scores is
  'Immutable scoring ledger. Identical signals and weights must score identically across jurisdictions.';
