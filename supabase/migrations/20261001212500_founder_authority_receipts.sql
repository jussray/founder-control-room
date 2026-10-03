-- Canonical one-shot founder action authority receipts.
--
-- `founder_permission_requests` remains the durable decision broker and carries
-- no execution authority by itself. This table is the separately scoped
-- execution-binding layer. Receipts are issued only from a fresh explicit
-- founder decision and are atomically reserved before an external mutation.
--
-- The repository's Neon migration preview is not a canonical Supabase mirror
-- and can lack older FCR broker tables. Create this ledger independently there,
-- then attach the broker FK whenever the canonical parent relation exists.
-- Production Supabase has the parent relation; the application also rereads the
-- broker decision before it can issue any receipt.

create table if not exists public.founder_authority_receipts (
  receipt_id text primary key,
  permission_request_id text not null,
  request_hash text not null,
  decision_hash text not null,
  receipt_hash text not null unique,
  action_type text not null,
  repository text not null,
  pull_request_number bigint,
  base_sha text,
  head_sha text not null,
  environment text,
  founder_user_id uuid not null,
  founder_email text not null,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reserved_at timestamptz,
  reserved_by text,
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint founder_authority_receipt_id check (receipt_id ~ '^far:[0-9a-f]{48}$'),
  constraint founder_authority_request_hash check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint founder_authority_decision_hash check (decision_hash ~ '^[0-9a-f]{64}$'),
  constraint founder_authority_receipt_hash check (receipt_hash ~ '^[0-9a-f]{64}$'),
  constraint founder_authority_action check (action_type in ('merge', 'deploy')),
  constraint founder_authority_repository check (repository ~ '^jussray/[A-Za-z0-9._-]+$'),
  constraint founder_authority_head_sha check (head_sha ~ '^[0-9a-f]{40}$'),
  constraint founder_authority_base_sha check (base_sha is null or base_sha ~ '^[0-9a-f]{40}$'),
  constraint founder_authority_status check (status in ('active', 'reserved', 'consumed', 'revoked')),
  constraint founder_authority_expiry check (expires_at > issued_at),
  constraint founder_authority_reservation_pair check (
    (reserved_at is null and reserved_by is null)
    or (reserved_at is not null and reserved_by is not null)
  ),
  constraint founder_authority_action_shape check (
    (action_type = 'merge'
      and pull_request_number is not null
      and pull_request_number > 0
      and base_sha is not null
      and environment is null)
    or
    (action_type = 'deploy'
      and pull_request_number is null
      and base_sha is null
      and environment = 'production')
  )
);

do $$
begin
  if to_regclass('public.founder_permission_requests') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'founder_authority_receipts_permission_request_fk'
         and conrelid = 'public.founder_authority_receipts'::regclass
     ) then
    alter table public.founder_authority_receipts
      add constraint founder_authority_receipts_permission_request_fk
      foreign key (permission_request_id)
      references public.founder_permission_requests(request_id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists founder_authority_receipts_permission_action_idx
  on public.founder_authority_receipts (permission_request_id, action_type);

create index if not exists founder_authority_receipts_active_idx
  on public.founder_authority_receipts (action_type, repository, head_sha, expires_at)
  where status in ('active', 'reserved') and consumed_at is null and revoked_at is null;

alter table public.founder_authority_receipts enable row level security;
revoke all on table public.founder_authority_receipts from anon, authenticated;

comment on table public.founder_authority_receipts is
  'Service-role-only exact-action authority receipts derived from explicit founder permission decisions. Broker decisions alone remain non-authorizing.';

create or replace function public.reserve_founder_authority_receipt(
  p_receipt_id text,
  p_action_type text,
  p_repository text,
  p_head_sha text,
  p_execution_key text,
  p_pull_request_number bigint default null,
  p_base_sha text default null,
  p_environment text default null
)
returns table (
  receipt_id text,
  permission_request_id text,
  action_type text,
  repository text,
  pull_request_number bigint,
  base_sha text,
  head_sha text,
  environment text,
  request_hash text,
  decision_hash text,
  receipt_hash text,
  status text,
  expires_at timestamptz,
  reserved_at timestamptz,
  reserved_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.founder_authority_receipts%rowtype;
begin
  if p_execution_key is null or length(btrim(p_execution_key)) < 8 then
    raise exception 'FOUNDER_AUTHORITY_EXECUTION_KEY_REQUIRED';
  end if;

  select * into v_row
  from public.founder_authority_receipts r
  where r.receipt_id = p_receipt_id
  for update;

  if not found then
    raise exception 'FOUNDER_AUTHORITY_RECEIPT_NOT_FOUND';
  end if;
  if v_row.status not in ('active', 'reserved')
    or v_row.consumed_at is not null
    or v_row.revoked_at is not null then
    raise exception 'FOUNDER_AUTHORITY_RECEIPT_NOT_ACTIVE';
  end if;
  if v_row.expires_at <= now() then
    raise exception 'FOUNDER_AUTHORITY_RECEIPT_EXPIRED';
  end if;
  if lower(v_row.action_type) <> lower(p_action_type)
    or lower(v_row.repository) <> lower(p_repository)
    or lower(v_row.head_sha) <> lower(p_head_sha)
    or coalesce(v_row.pull_request_number, -1) <> coalesce(p_pull_request_number, -1)
    or coalesce(lower(v_row.base_sha), '') <> coalesce(lower(p_base_sha), '')
    or coalesce(lower(v_row.environment), '') <> coalesce(lower(p_environment), '') then
    raise exception 'FOUNDER_AUTHORITY_RECEIPT_SCOPE_MISMATCH';
  end if;
  if v_row.reserved_by is not null and v_row.reserved_by <> p_execution_key then
    raise exception 'FOUNDER_AUTHORITY_RECEIPT_ALREADY_RESERVED';
  end if;

  update public.founder_authority_receipts
  set status = 'reserved',
      reserved_at = coalesce(reserved_at, now()),
      reserved_by = coalesce(reserved_by, p_execution_key)
  where founder_authority_receipts.receipt_id = p_receipt_id
  returning * into v_row;

  return query select
    v_row.receipt_id,
    v_row.permission_request_id,
    v_row.action_type,
    v_row.repository,
    v_row.pull_request_number,
    v_row.base_sha,
    v_row.head_sha,
    v_row.environment,
    v_row.request_hash,
    v_row.decision_hash,
    v_row.receipt_hash,
    v_row.status,
    v_row.expires_at,
    v_row.reserved_at,
    v_row.reserved_by;
end;
$$;

revoke all on function public.reserve_founder_authority_receipt(text, text, text, text, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_founder_authority_receipt(text, text, text, text, text, bigint, text, text)
  to service_role;
