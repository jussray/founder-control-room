-- Governed content system data layer — FCR hub mirror of the editorial queue.
--
-- Governance: Founder Content System (installed 2026-10-23). Approval binds to
-- the exact content hash AND the exact media hash, expires 24 hours after
-- approval, and no approval means no publication. A native publication receipt
-- is required before anything is called published; receipts form a successor
-- chain (predecessor_receipt_id) and are never edited in place.
--
-- Relationship to existing FCR stores (verified by the 2026-11-03 stack audit;
-- this migration deliberately does NOT duplicate authority):
-- - public.founder_content_approvals (20260819073000) is the authoritative
--   one-shot content-approval ledger: proposal/payload/authorization hashes,
--   expiry, revocation, one-time consumption, claim-before-provider-mutation.
--   This migration therefore creates NO second approvals table. The editorial
--   approval record lives on content_queue as mirror fields, and a queue row
--   links to the authoritative row via founder_approval_id once the trusted
--   backend issues it.
-- - public.approvals (init schema) covers mission/change-proposal decisions
--   (create_branch / deploy / rollback), not content approvals.
-- - public.founder_content_posts (20260907152000) remains the provider-neutral
--   publication lifecycle ledger. publication_receipts here is the queue
--   lane's native receipt chain; it links to the lifecycle post via
--   founder_post_id when an item is promoted.
-- - public.founder_content_metric_observations (20260919023000) remains the
--   normalized observation store (impressions/reactions/attributed family).
--   post_metrics here stores the wide per-post snapshots the social watch lane
--   actually collects (reach/views/shares/saves/bio taps), keyed to receipts.
--
-- Source-only until an explicitly authorized database apply. Committing this
-- migration does not mutate production Supabase state.

begin;

-- ---------------------------------------------------------------------------
-- content_queue — editorial staging queue; mirrors posting-queue.json fields.
-- ---------------------------------------------------------------------------

create table if not exists public.content_queue (
  id text primary key
    check (length(btrim(id)) between 1 and 120),
  project text not null
    check (length(btrim(project)) between 1 and 160),
  account text not null
    check (length(btrim(account)) between 1 and 160),
  account_id text
    check (account_id is null or length(btrim(account_id)) between 1 and 240),
  platform text not null default 'instagram'
    check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  caption text not null,
  media_path text,
  media_hash text
    check (media_hash is null or media_hash ~ '^[0-9a-f]{64}$'),
  media_reviewed_at timestamptz,
  cta_url text
    check (cta_url is null or cta_url ~ '^https://'),
  fingerprint text not null
    check (length(btrim(fingerprint)) between 1 and 2000),
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  seo_keywords jsonb not null default '[]'::jsonb,
  geo_statement text,
  aeo_question text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'APPROVED', 'HELD', 'WITHDRAWN', 'PUBLISHED', 'BLOCKED')),
  approved_at timestamptz,
  approved_by text,
  approval_expires_at timestamptz,
  withdrawn_at timestamptz,
  status_note text,
  founder_approval_id text
    references public.founder_content_approvals(approval_id) on delete set null,
  founder_post_id uuid
    references public.founder_content_posts(post_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_queue_seo_keywords_array_check
    check (jsonb_typeof(seo_keywords) = 'array'),
  -- Data-level guard for the 2026-11-03 failure class (batch approval granted
  -- on captions whose media the founder had never seen; B1-01 withdrawn on
  -- sight, B1-02..B1-08 held): an APPROVED row is UNREPRESENTABLE unless the
  -- exact media is hash-bound and its review is recorded, and the approval
  -- carries a live expiry. media_hash is a distinct column from content_hash:
  -- text approval can never stand in for seen media.
  constraint content_queue_approval_requires_seen_media check (
    status <> 'APPROVED'
    or (
      approved_at is not null
      and coalesce(btrim(approved_by), '') <> ''
      and media_hash is not null
      and media_reviewed_at is not null
      and approval_expires_at is not null
      and approval_expires_at > approved_at
    )
  ),
  constraint content_queue_approval_expiry_pair_check check (
    approved_at is null
    or approval_expires_at is null
    or approval_expires_at > approved_at
  ),
  constraint content_queue_withdrawn_pair_check check (
    status <> 'WITHDRAWN' or withdrawn_at is not null
  )
);

create index if not exists content_queue_account_status_idx
  on public.content_queue (account, status, updated_at desc);

create index if not exists content_queue_status_expiry_idx
  on public.content_queue (status, approval_expires_at)
  where status = 'APPROVED';

create index if not exists content_queue_fingerprint_idx
  on public.content_queue (fingerprint);

alter table public.content_queue enable row level security;
drop policy if exists content_queue_service_role_only on public.content_queue;
create policy content_queue_service_role_only on public.content_queue
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.content_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.content_queue to service_role;

comment on table public.content_queue is
  'Service-role-only editorial staging queue for the governed content system (Founder Content System, 2026-10-23). Mirror of posting-queue.json. Editorial state only: execution authority remains public.founder_content_approvals; an APPROVED row requires hash-bound, founder-reviewed media (media_hash + media_reviewed_at) and a live 24h approval expiry.';

-- Approval-binding guard: approval is bound to the EXACT approved content and
-- media. Any mutation of a bound field on an APPROVED row voids the approval
-- in the same write: the row demotes to HELD, approval fields clear, and the
-- authoritative approval link is severed. Media identity changes also void
-- any prior media review, so re-approval is impossible until the new media
-- has itself been reviewed and hash-bound.
create or replace function public.guard_content_queue_approval_binding()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  if new.media_hash is distinct from old.media_hash
     or new.media_path is distinct from old.media_path then
    new.media_reviewed_at := null;
  end if;

  if old.status = 'APPROVED'
     and new.status = 'APPROVED'
     and (
       new.caption is distinct from old.caption
       or new.cta_url is distinct from old.cta_url
       or new.content_hash is distinct from old.content_hash
       or new.media_hash is distinct from old.media_hash
       or new.media_path is distinct from old.media_path
     ) then
    new.status := 'HELD';
    new.approved_at := null;
    new.approved_by := null;
    new.approval_expires_at := null;
    new.founder_approval_id := null;
    new.status_note := 'Auto-held by guard_content_queue_approval_binding: approved content/media changed after approval; founder re-approval with fresh media review is required.';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.guard_content_queue_approval_binding()
  from public, anon, authenticated;

drop trigger if exists content_queue_approval_binding_guard on public.content_queue;
create trigger content_queue_approval_binding_guard
  before update on public.content_queue
  for each row
  execute function public.guard_content_queue_approval_binding();

comment on function public.guard_content_queue_approval_binding() is
  'Keeps content_queue approvals bound to the exact approved content hash and media hash. Mutating bound content/media on an APPROVED row demotes it to HELD and clears the approval; media changes void media review. Prevents approval-on-unseen-media at the data level.';

-- ---------------------------------------------------------------------------
-- publication_receipts — native publication receipts, successor chain.
-- ---------------------------------------------------------------------------

create table if not exists public.publication_receipts (
  id uuid primary key default gen_random_uuid(),
  queue_id text not null
    references public.content_queue(id) on delete restrict,
  founder_post_id uuid
    references public.founder_content_posts(post_id) on delete set null,
  platform text not null
    check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  account text not null
    check (length(btrim(account)) between 1 and 160),
  account_id text
    check (account_id is null or length(btrim(account_id)) between 1 and 240),
  native_post_id text not null
    check (length(btrim(native_post_id)) between 1 and 240),
  native_url text
    check (native_url is null or native_url ~ '^https://'),
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null,
  predecessor_receipt_id uuid
    references public.publication_receipts(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint publication_receipts_not_self_predecessor check (
    predecessor_receipt_id is null or predecessor_receipt_id <> id
  ),
  constraint publication_receipts_native_identity_key
    unique (platform, account, native_post_id)
);

-- Exactly one chain head (predecessor-less receipt) per queue item: every
-- later receipt for the item must name its predecessor, forming one chain.
create unique index if not exists publication_receipts_chain_head_idx
  on public.publication_receipts (queue_id)
  where predecessor_receipt_id is null;

create index if not exists publication_receipts_queue_published_idx
  on public.publication_receipts (queue_id, published_at desc);

alter table public.publication_receipts enable row level security;
drop policy if exists publication_receipts_service_role_only on public.publication_receipts;
create policy publication_receipts_service_role_only on public.publication_receipts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Append-only: direct update/delete stay revoked even for the service role,
-- so a receipt can be superseded (a new receipt naming it as predecessor)
-- but never rewritten.
revoke all on table public.publication_receipts from public, anon, authenticated, service_role;
grant select, insert on table public.publication_receipts to service_role;

comment on table public.publication_receipts is
  'Append-only native publication receipts for the governed content system. One successor chain per content_queue item (predecessor_receipt_id; exactly one chain head). A queue item is published only when a receipt exists here; receipts are never edited in place, only superseded.';

-- ---------------------------------------------------------------------------
-- post_metrics — wide per-post metric snapshots keyed to receipts.
-- ---------------------------------------------------------------------------

create table if not exists public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null
    references public.publication_receipts(id) on delete cascade,
  measured_at timestamptz not null default now(),
  "window" text not null
    check ("window" in ('24h', '72h', '7d', 'lifetime', 'rolling_7d')),
  evidence_state text not null default 'OBSERVED'
    check (evidence_state in ('OBSERVED', 'PARTIAL', 'UNKNOWN_NO_EVIDENCE')),
  -- No defaults on any metric column: an unmeasured metric stays NULL.
  -- UNKNOWN is recorded, never zero-filled.
  reach bigint check (reach is null or reach >= 0),
  views bigint check (views is null or views >= 0),
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  shares bigint check (shares is null or shares >= 0),
  saves bigint check (saves is null or saves >= 0),
  profile_visits bigint check (profile_visits is null or profile_visits >= 0),
  bio_link_taps bigint check (bio_link_taps is null or bio_link_taps >= 0),
  created_at timestamptz not null default now(),
  constraint post_metrics_unknown_means_null check (
    evidence_state <> 'UNKNOWN_NO_EVIDENCE'
    or (
      reach is null and views is null and likes is null and comments is null
      and shares is null and saves is null and profile_visits is null
      and bio_link_taps is null
    )
  )
);

create index if not exists post_metrics_receipt_measured_idx
  on public.post_metrics (receipt_id, measured_at desc);

alter table public.post_metrics enable row level security;
drop policy if exists post_metrics_service_role_only on public.post_metrics;
create policy post_metrics_service_role_only on public.post_metrics
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Append-only snapshots: corrections arrive as new rows at a later
-- measured_at, never as edits.
revoke all on table public.post_metrics from public, anon, authenticated, service_role;
grant select, insert on table public.post_metrics to service_role;

comment on table public.post_metrics is
  'Append-only wide per-post metric snapshots for the governed content system, keyed to publication_receipts. Metric columns are nullable with no defaults: UNKNOWN is NULL, never zero-filled; evidence_state records OBSERVED / PARTIAL / UNKNOWN_NO_EVIDENCE per snapshot. Measurement windows follow the Founder Content System (24h / 72h / 7d).';

commit;
