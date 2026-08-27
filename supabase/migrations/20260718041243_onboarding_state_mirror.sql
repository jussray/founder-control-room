-- Production-applied migration fossil restored from supabase_migrations.schema_migrations.

do $$ begin
  create type onboarding_stage as enum (
    'pre_signup', 'signed_up', 'consent_complete', 'age_verified',
    'role_selected', 'name_set', 'identity_set', 'reflection_complete',
    'parent_link_sent', 'parent_linked', 'parent_link_skipped',
    'parent_setup_complete', 'activated', 'steady_state'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('teen', 'parent', 'unknown');
exception when duplicate_object then null; end $$;

create table if not exists public.user_onboarding_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  stage onboarding_stage not null default 'signed_up',
  role user_role not null default 'unknown',
  activated_at timestamptz,
  activation_action text,
  age_bucket text,
  referral_source text,
  device_platform text,
  parent_link_code text unique,
  parent_linked_at timestamptz,
  linked_parent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  signup_to_consent_secs integer,
  consent_to_age_secs integer,
  age_to_role_secs integer,
  role_to_name_secs integer,
  name_to_identity_secs integer,
  identity_to_activated_secs integer,
  constraint one_state_per_user unique (user_id)
);

create or replace function update_onboarding_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onboarding_state_updated_at on public.user_onboarding_state;
create trigger onboarding_state_updated_at
  before update on public.user_onboarding_state
  for each row execute function update_onboarding_updated_at();

alter table public.user_onboarding_state enable row level security;

drop policy if exists "Service role full access" on public.user_onboarding_state;
create policy "Service role full access"
  on public.user_onboarding_state for all
  using (auth.role() = 'service_role');

create index if not exists idx_onboarding_stage on public.user_onboarding_state(stage);
create index if not exists idx_onboarding_role on public.user_onboarding_state(role);
create index if not exists idx_onboarding_created_at on public.user_onboarding_state(created_at desc);
create index if not exists idx_onboarding_activated_at
  on public.user_onboarding_state(activated_at desc)
  where activated_at is not null;

comment on table public.user_onboarding_state is
  'Mirror of Se''kret Bip onboarding state for founder control room analytics. Populated via pg_cron ETL or manual sync.';
