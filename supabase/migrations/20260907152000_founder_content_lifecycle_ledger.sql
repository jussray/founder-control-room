-- Durable provider-neutral founder-content editorial lifecycle.
--
-- This ledger owns public draft payload + lifecycle state only. It does NOT own
-- founder publication authority, cadence authority, provider credentials, or
-- provider-write reservations. Those remain in founder_content_approvals,
-- founder_content_cadence_reservations, connection vault/provider adapters, and
-- approval_executions respectively.
--
-- Source-only until an explicitly authorized database apply. Committing this
-- migration does not mutate production Supabase state.

begin;

create table if not exists public.founder_content_posts (
  post_id uuid primary key default gen_random_uuid(),
  founder_user_id text not null,
  provider text not null
    check (provider ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  platform text not null
    check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  account_id text not null
    check (length(btrim(account_id)) between 1 and 240),
  title text not null default '',
  public_payload jsonb not null default '{}'::jsonb,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  media_count integer not null default 0 check (media_count between 0 and 100),
  status text not null default 'pending_approval'
    check (status in (
      'pending_approval',
      'approved',
      'scheduled',
      'publishing',
      'posted',
      'rejected',
      'failed',
      'outcome_unknown'
    )),
  provider_write_state text not null default 'not_attempted'
    check (provider_write_state in (
      'not_attempted',
      'attempted',
      'verified_published',
      'verified_failed',
      'unknown'
    )),
  approval_id text references public.founder_content_approvals(approval_id) on delete set null,
  execution_id uuid references public.approval_executions(id) on delete set null,
  scheduled_at timestamptz,
  posted_at timestamptz,
  external_post_id text,
  permalink text check (permalink is null or permalink ~ '^https://'),
  retry_count integer not null default 0 check (retry_count between 0 and 1000),
  last_error text,
  last_metrics_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founder_content_posts_public_payload_object_check
    check (jsonb_typeof(public_payload) = 'object'),
  constraint founder_content_posts_publication_pair_check
    check (
      (status = 'posted' and provider_write_state = 'verified_published'
        and posted_at is not null and external_post_id is not null and permalink is not null)
      or status <> 'posted'
    ),
  constraint founder_content_posts_unknown_write_check
    check (
      status <> 'outcome_unknown' or provider_write_state = 'unknown'
    )
);

create index if not exists founder_content_posts_founder_status_idx
  on public.founder_content_posts (founder_user_id, status, updated_at desc);

create index if not exists founder_content_posts_founder_platform_idx
  on public.founder_content_posts (founder_user_id, platform, updated_at desc);

create index if not exists founder_content_posts_approval_idx
  on public.founder_content_posts (approval_id)
  where approval_id is not null;

create index if not exists founder_content_posts_execution_idx
  on public.founder_content_posts (execution_id)
  where execution_id is not null;

alter table public.founder_content_posts enable row level security;
drop policy if exists founder_content_posts_service_role_only on public.founder_content_posts;
create policy founder_content_posts_service_role_only on public.founder_content_posts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_posts from public, anon, authenticated;
grant select, insert, update, delete on table public.founder_content_posts to service_role;

comment on table public.founder_content_posts is
  'Service-role-only provider-neutral founder-content editorial state. Public draft payload and lifecycle truth only; approval, cadence, credential, and provider-write authority live in separate canonical FCR stores.';

create table if not exists public.founder_content_post_events (
  event_id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.founder_content_posts(post_id) on delete cascade,
  founder_user_id text not null,
  event_type text not null
    check (event_type ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'),
  actor text not null default 'fcr',
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  constraint founder_content_post_events_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists founder_content_post_events_post_idx
  on public.founder_content_post_events (post_id, observed_at desc);

create index if not exists founder_content_post_events_founder_type_idx
  on public.founder_content_post_events (founder_user_id, event_type, observed_at desc);

alter table public.founder_content_post_events enable row level security;
drop policy if exists founder_content_post_events_service_role_only on public.founder_content_post_events;
create policy founder_content_post_events_service_role_only on public.founder_content_post_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_post_events from public, anon, authenticated;
grant select, insert on table public.founder_content_post_events to service_role;
revoke update, delete on table public.founder_content_post_events from service_role;

comment on table public.founder_content_post_events is
  'Append-only founder-content lifecycle evidence. Review comments, state transitions, provider readback, operational logs, and metric snapshots are recorded as events and never used as publication authority by themselves.';

commit;
