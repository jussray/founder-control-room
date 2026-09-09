-- Friend Intake v1 privacy-bounded persistence.
--
-- Source-only until a separately authorized production database apply.
-- Raw founder input, transcripts, related memories, embeddings, provider
-- payloads, and credentials are intentionally absent from these tables.

begin;

create table if not exists public.friend_intake_summaries (
  intake_id uuid primary key,
  run_id uuid not null unique,
  founder_user_id text not null,
  redacted_summary text not null
    check (length(btrim(redacted_summary)) between 1 and 1200),
  intent_tags text[] not null
    check (cardinality(intent_tags) between 1 and 3),
  runtime_provider text not null
    check (runtime_provider in ('deterministic', 'openai', 'anthropic', 'perplexity')),
  model text not null
    check (length(btrim(model)) between 1 and 200),
  provenance_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists friend_intake_summaries_founder_created_idx
  on public.friend_intake_summaries (founder_user_id, created_at desc);

alter table public.friend_intake_summaries enable row level security;
drop policy if exists friend_intake_summaries_service_role_only
  on public.friend_intake_summaries;
create policy friend_intake_summaries_service_role_only
  on public.friend_intake_summaries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.friend_intake_summaries from public, anon, authenticated;
grant select, insert, delete on table public.friend_intake_summaries to service_role;
revoke update on table public.friend_intake_summaries from service_role;

comment on table public.friend_intake_summaries is
  'Service-role-only Friend Intake redacted summaries. No raw transcript, related memory, embedding, credential, or provider payload is permitted.';

create table if not exists public.friend_intake_feedback (
  run_id uuid primary key,
  founder_user_id text not null,
  response text not null
    check (response in ('yes', 'not_really', 'wrong_time')),
  recorded_at timestamptz not null default now()
);

create index if not exists friend_intake_feedback_founder_recorded_idx
  on public.friend_intake_feedback (founder_user_id, recorded_at desc);

alter table public.friend_intake_feedback enable row level security;
drop policy if exists friend_intake_feedback_service_role_only
  on public.friend_intake_feedback;
create policy friend_intake_feedback_service_role_only
  on public.friend_intake_feedback
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.friend_intake_feedback from public, anon, authenticated;
grant select, insert, delete on table public.friend_intake_feedback to service_role;
revoke update on table public.friend_intake_feedback from service_role;

comment on table public.friend_intake_feedback is
  'Service-role-only one-response-per-run usefulness telemetry for Friend Intake. Stores no founder input or model output.';

commit;
