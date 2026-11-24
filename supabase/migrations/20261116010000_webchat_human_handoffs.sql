begin;

-- Webchat `/human` handoff queue. Service-role only; no anon/authenticated access.
-- Holds hashed visitor identity and an optional visitor reason (<= 280 chars);
-- never raw visitor identity, message history, or provider payloads.
create table public.webchat_human_handoffs (
  idempotency_key text primary key check (idempotency_key ~ '^webchat-handoff:[a-f0-9]{64}$'),
  project_id text not null check (project_id ~ '^[a-z0-9][a-z0-9._:-]{1,63}$'),
  brand_id text not null check (brand_id ~ '^[a-z0-9][a-z0-9._:-]{1,63}$'),
  conversation_id text not null check (length(conversation_id) between 8 and 128),
  visitor_hash text not null check (visitor_hash ~ '^anon:[a-f0-9]{64}$'),
  source_event_id text not null check (source_event_id ~ '^[a-f0-9]{64}$'),
  reason text check (reason is null or length(reason) <= 280),
  state text not null default 'pending_human' check (state in ('pending_human', 'released')),
  requested_at timestamptz not null,
  released_at timestamptz,
  released_by text check (released_by is null or length(released_by) <= 128),
  created_at timestamptz not null default now(),
  check ((state = 'released') = (released_at is not null))
);

-- At most one open handoff per conversation: retries and repeated /human
-- messages collapse onto the existing pending row.
create unique index webchat_human_handoffs_one_open_idx
  on public.webchat_human_handoffs (project_id, conversation_id)
  where state = 'pending_human';
create index webchat_human_handoffs_queue_idx
  on public.webchat_human_handoffs (requested_at)
  where state = 'pending_human';

alter table public.webchat_human_handoffs enable row level security;
revoke all on table public.webchat_human_handoffs from public, anon, authenticated, service_role;
grant select, insert, update on table public.webchat_human_handoffs to service_role;
comment on table public.webchat_human_handoffs is 'Webchat /human handoff queue (pending_human -> released by founder). Service-role only. Grants no dispatch or outreach authority.';

commit;
