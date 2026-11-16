create table if not exists public.quickscan_prospects (
  id text primary key,
  prospect jsonb not null,
  updated_at timestamptz not null default now(),
  constraint quickscan_prospects_id_length
    check (char_length(id) between 1 and 160),
  constraint quickscan_prospects_document_object
    check (jsonb_typeof(prospect) = 'object')
);

create index if not exists quickscan_prospects_updated_at_idx
  on public.quickscan_prospects (updated_at desc);

alter table public.quickscan_prospects enable row level security;
revoke all on table public.quickscan_prospects from anon, authenticated;
grant select, insert, update, delete on table public.quickscan_prospects to service_role;

comment on table public.quickscan_prospects is
  'Server/service-role-only durable QuickScan prospect state. Founder browser access stays behind the authenticated FCR API boundary.';

create table if not exists public.quickscan_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now(),
  constraint quickscan_stripe_events_id_length
    check (char_length(event_id) between 1 and 255)
);

alter table public.quickscan_stripe_events enable row level security;
revoke all on table public.quickscan_stripe_events from anon, authenticated;
grant select, insert, update on table public.quickscan_stripe_events to service_role;

comment on table public.quickscan_stripe_events is
  'Server/service-role-only durable Stripe webhook idempotency ledger for QuickScan.';
