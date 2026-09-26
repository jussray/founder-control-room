-- FCR Durable Agent Execution Kernel v11.5
-- Source-only schema with owner-only authority/execution functions. Existing
-- production executors are intentionally NOT wired to this kernel until a
-- separate activation migration binds distinct issuer, PEP, and worker identities.

create table if not exists public.agent_task_authority_state (
  task_id text primary key,
  status text not null check (status in ('ACTIVE', 'REVOKED', 'QUARANTINED')),
  authority_epoch bigint not null check (authority_epoch >= 0),
  next_fencing_token bigint not null default 0 check (next_fencing_token >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.agent_execution_admissions (
  admission_id uuid primary key,
  permit_id text not null unique,
  task_id text not null references public.agent_task_authority_state(task_id) on delete restrict,
  agent_id text not null,
  executor_id text not null,
  request_digest text not null check (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  permit_digest text not null check (permit_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_envelope_digest text not null check (canonical_envelope_digest ~ '^sha256:[0-9a-f]{64}$'),
  authority_epoch bigint not null,
  fencing_token bigint not null check (fencing_token > 0),
  permit_expires_at timestamptz not null,
  retention_until timestamptz not null,
  downstream_idempotency_key text not null,
  idempotency_mode text not null check (idempotency_mode in ('native', 'client-token', 'reconcile', 'none')),
  risk_tier text not null check (risk_tier in ('LOW', 'HIGH', 'CRITICAL')),
  execution_status text not null default 'CLAIMED' check (
    execution_status in (
      'CLAIMED', 'DISPATCHING', 'SUCCEEDED', 'FAILED_PRE_EFFECT',
      'UNKNOWN_OUTCOME', 'RECONCILING', 'REQUIRES_REVIEW',
      'RECONCILED_SUCCEEDED', 'RECONCILED_NOT_EXECUTED'
    )
  ),
  consumed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  check (retention_until > permit_expires_at),
  unique (task_id, fencing_token)
);

create table if not exists public.agent_execution_receipts (
  receipt_id uuid primary key,
  admission_id uuid not null references public.agent_execution_admissions(admission_id) on delete restrict,
  event_type text not null check (
    event_type in (
      'EXECUTION_STARTED', 'DISPATCHING', 'EXECUTION_COMPLETED',
      'EXECUTION_FAILED_PRE_EFFECT', 'PENDING_UNKNOWN_OUTCOME',
      'REQUIRES_REVIEW', 'RECONCILING', 'RECONCILED_COMPLETED',
      'RECONCILED_NOT_EXECUTED'
    )
  ),
  task_id text not null,
  permit_id text not null,
  request_digest text not null check (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  permit_digest text not null check (permit_digest ~ '^sha256:[0-9a-f]{64}$'),
  authority_epoch bigint not null,
  fencing_token bigint not null,
  lease_generation bigint,
  occurred_at timestamptz not null default clock_timestamp()
);

create table if not exists public.agent_execution_outbox (
  operation_id uuid primary key,
  admission_id uuid not null unique references public.agent_execution_admissions(admission_id) on delete restrict,
  permit_id text not null unique,
  task_id text not null,
  request_digest text not null check (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonical_envelope_digest text not null check (canonical_envelope_digest ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key text not null,
  idempotency_mode text not null check (idempotency_mode in ('native', 'client-token', 'reconcile', 'none')),
  risk_tier text not null check (risk_tier in ('LOW', 'HIGH', 'CRITICAL')),
  destination text not null,
  payload_ref text not null,
  status text not null default 'PENDING' check (
    status in (
      'PENDING', 'LEASED', 'SUCCEEDED', 'FAILED_PRE_EFFECT',
      'UNKNOWN_OUTCOME', 'RECONCILING', 'REQUIRES_REVIEW'
    )
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text,
  lease_generation bigint not null default 0 check (lease_generation >= 0),
  lease_expires_at timestamptz,
  provider_operation_id text,
  created_at timestamptz not null default clock_timestamp(),
  dispatched_at timestamptz,
  completed_at timestamptz
);

alter table public.agent_task_authority_state enable row level security;
alter table public.agent_execution_admissions enable row level security;
alter table public.agent_execution_receipts enable row level security;
alter table public.agent_execution_outbox enable row level security;

revoke all on table public.agent_task_authority_state from public, anon, authenticated, service_role;
revoke all on table public.agent_execution_admissions from public, anon, authenticated, service_role;
revoke all on table public.agent_execution_receipts from public, anon, authenticated, service_role;
revoke all on table public.agent_execution_outbox from public, anon, authenticated, service_role;

create or replace function public.initialize_agent_task_authority_v11_5(
  p_task_id text,
  p_authority_epoch bigint default 1
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  if p_task_id is null or btrim(p_task_id) = '' then
    raise exception 'task_id is required';
  end if;
  if p_authority_epoch < 0 then
    raise exception 'authority_epoch must be non-negative';
  end if;

  insert into public.agent_task_authority_state (
    task_id, status, authority_epoch, next_fencing_token
  ) values (
    p_task_id, 'ACTIVE', p_authority_epoch, 0
  ) on conflict (task_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.transition_agent_task_authority_v11_5(
  p_task_id text,
  p_expected_epoch bigint,
  p_new_status text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_epoch bigint;
  next_epoch bigint;
begin
  if p_new_status not in ('ACTIVE', 'REVOKED', 'QUARANTINED') then
    raise exception 'invalid authority status';
  end if;

  select authority_epoch
    into current_epoch
    from public.agent_task_authority_state
   where task_id = p_task_id
   for update;

  if not found then raise exception 'AUTHORITY_MISSING'; end if;
  if current_epoch <> p_expected_epoch then raise exception 'STALE_AUTHORITY_EPOCH'; end if;

  next_epoch := current_epoch + 1;
  update public.agent_task_authority_state
     set status = p_new_status,
         authority_epoch = next_epoch,
         updated_at = clock_timestamp()
   where task_id = p_task_id;

  return next_epoch;
end;
$$;

create or replace function public.admit_agent_execution_v11_5(
  p_admission_id uuid,
  p_receipt_id uuid,
  p_operation_id uuid,
  p_permit_id text,
  p_task_id text,
  p_agent_id text,
  p_executor_id text,
  p_request_digest text,
  p_permit_digest text,
  p_canonical_envelope_digest text,
  p_authority_epoch bigint,
  p_permit_expires_at timestamptz,
  p_retention_until timestamptz,
  p_downstream_idempotency_key text,
  p_idempotency_mode text,
  p_risk_tier text,
  p_destination text,
  p_payload_ref text
) returns table (
  admitted boolean,
  reason text,
  admission_id uuid,
  fencing_token bigint,
  operation_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status text;
  current_epoch bigint;
  current_fence bigint;
  next_fence bigint;
  inserted_count integer;
begin
  -- Admission and revocation contend on this same row lock. This is the
  -- authority linearization point for protected execution.
  select status, authority_epoch, next_fencing_token
    into current_status, current_epoch, current_fence
    from public.agent_task_authority_state
   where task_id = p_task_id
   for update;

  if not found then
    return query select false, 'AUTHORITY_MISSING', null::uuid, null::bigint, null::uuid;
    return;
  end if;
  if current_status <> 'ACTIVE' then
    return query select false, 'REVOKED_OR_QUARANTINED', null::uuid, null::bigint, null::uuid;
    return;
  end if;
  if current_epoch <> p_authority_epoch then
    return query select false, 'STALE_AUTHORITY_EPOCH', null::uuid, null::bigint, null::uuid;
    return;
  end if;
  if p_permit_expires_at <= clock_timestamp() then
    return query select false, 'EXECUTION_PERMIT_EXPIRED', null::uuid, null::bigint, null::uuid;
    return;
  end if;
  if p_retention_until <= p_permit_expires_at then
    raise exception 'retention_until must be later than permit_expires_at';
  end if;
  if p_idempotency_mode not in ('native', 'client-token', 'reconcile', 'none') then
    raise exception 'invalid idempotency mode';
  end if;
  if p_risk_tier not in ('LOW', 'HIGH', 'CRITICAL') then
    raise exception 'invalid risk tier';
  end if;
  if p_risk_tier in ('HIGH', 'CRITICAL') and p_idempotency_mode = 'none' then
    return query select false, 'UNSAFE_DESTINATION_RETRY_CONTRACT', null::uuid, null::bigint, null::uuid;
    return;
  end if;

  next_fence := current_fence + 1;

  insert into public.agent_execution_admissions (
    admission_id, permit_id, task_id, agent_id, executor_id,
    request_digest, permit_digest, canonical_envelope_digest,
    authority_epoch, fencing_token, permit_expires_at, retention_until,
    downstream_idempotency_key, idempotency_mode, risk_tier, execution_status
  ) values (
    p_admission_id, p_permit_id, p_task_id, p_agent_id, p_executor_id,
    p_request_digest, p_permit_digest, p_canonical_envelope_digest,
    p_authority_epoch, next_fence, p_permit_expires_at, p_retention_until,
    p_downstream_idempotency_key, p_idempotency_mode, p_risk_tier, 'CLAIMED'
  ) on conflict (permit_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count <> 1 then
    return query select false, 'EXECUTION_PERMIT_ALREADY_CONSUMED', null::uuid, null::bigint, null::uuid;
    return;
  end if;

  update public.agent_task_authority_state
     set next_fencing_token = next_fence,
         updated_at = clock_timestamp()
   where task_id = p_task_id;

  insert into public.agent_execution_receipts (
    receipt_id, admission_id, event_type, task_id, permit_id,
    request_digest, permit_digest, authority_epoch, fencing_token
  ) values (
    p_receipt_id, p_admission_id, 'EXECUTION_STARTED', p_task_id, p_permit_id,
    p_request_digest, p_permit_digest, p_authority_epoch, next_fence
  );

  -- The outbox row is part of the SAME transaction as authority validation,
  -- permit consumption, fencing-token allocation, and EXECUTION_STARTED.
  insert into public.agent_execution_outbox (
    operation_id, admission_id, permit_id, task_id, request_digest,
    canonical_envelope_digest, idempotency_key, idempotency_mode, risk_tier,
    destination, payload_ref, status
  ) values (
    p_operation_id, p_admission_id, p_permit_id, p_task_id, p_request_digest,
    p_canonical_envelope_digest, p_downstream_idempotency_key, p_idempotency_mode,
    p_risk_tier, p_destination, p_payload_ref, 'PENDING'
  );

  return query select true, 'ADMITTED', p_admission_id, next_fence, p_operation_id;
end;
$$;

create or replace function public.lease_agent_execution_outbox_v11_5(
  p_worker_id text,
  p_lease_seconds integer default 30
) returns setof public.agent_execution_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then raise exception 'worker_id is required'; end if;
  if p_lease_seconds < 1 or p_lease_seconds > 300 then raise exception 'lease_seconds out of range'; end if;

  -- An expired lease does not imply retry safety. Reconcile-capable destinations
  -- move to reconciliation; non-idempotent destinations require human review.
  update public.agent_execution_outbox
     set status = case
       when idempotency_mode = 'reconcile' then 'RECONCILING'
       when idempotency_mode = 'none' then 'REQUIRES_REVIEW'
       else status
     end,
     lease_owner = case when idempotency_mode in ('reconcile', 'none') then null else lease_owner end,
     lease_expires_at = case when idempotency_mode in ('reconcile', 'none') then null else lease_expires_at end
   where status = 'LEASED'
     and lease_expires_at < clock_timestamp()
     and idempotency_mode in ('reconcile', 'none');

  return query
  with next_operation as (
    select operation_id
      from public.agent_execution_outbox
     where status = 'PENDING'
        or (
          status = 'LEASED'
          and lease_expires_at < clock_timestamp()
          and idempotency_mode in ('native', 'client-token')
        )
     order by created_at, operation_id
     for update skip locked
     limit 1
  )
  update public.agent_execution_outbox as outbox
     set status = 'LEASED',
         lease_owner = p_worker_id,
         lease_generation = outbox.lease_generation + 1,
         lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
         attempt_count = outbox.attempt_count + 1,
         dispatched_at = coalesce(outbox.dispatched_at, clock_timestamp())
    from next_operation
   where outbox.operation_id = next_operation.operation_id
  returning outbox.*;
end;
$$;

create or replace function public.record_agent_execution_outcome_v11_5(
  p_receipt_id uuid,
  p_operation_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_outcome text,
  p_provider_operation_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.agent_execution_outbox%rowtype;
  next_status text;
  next_event text;
begin
  if p_outcome not in ('SUCCEEDED', 'FAILED_PRE_EFFECT', 'UNKNOWN_OUTCOME') then
    raise exception 'invalid execution outcome';
  end if;

  select * into current_row
    from public.agent_execution_outbox
   where operation_id = p_operation_id
     and status = 'LEASED'
     and lease_owner = p_worker_id
     and lease_generation = p_lease_generation
     and lease_expires_at > clock_timestamp()
   for update;

  if not found then return false; end if;

  if p_outcome = 'UNKNOWN_OUTCOME' and current_row.idempotency_mode = 'none' then
    next_status := 'REQUIRES_REVIEW';
    next_event := 'REQUIRES_REVIEW';
  elsif p_outcome = 'UNKNOWN_OUTCOME' then
    next_status := 'UNKNOWN_OUTCOME';
    next_event := 'PENDING_UNKNOWN_OUTCOME';
  elsif p_outcome = 'FAILED_PRE_EFFECT' then
    next_status := 'FAILED_PRE_EFFECT';
    next_event := 'EXECUTION_FAILED_PRE_EFFECT';
  else
    next_status := 'SUCCEEDED';
    next_event := 'EXECUTION_COMPLETED';
  end if;

  update public.agent_execution_outbox
     set status = next_status,
         provider_operation_id = coalesce(p_provider_operation_id, provider_operation_id),
         completed_at = case when next_status in ('SUCCEEDED', 'FAILED_PRE_EFFECT') then clock_timestamp() else completed_at end,
         lease_owner = null,
         lease_expires_at = null
   where operation_id = p_operation_id
     and lease_owner = p_worker_id
     and lease_generation = p_lease_generation;

  update public.agent_execution_admissions
     set execution_status = next_status
   where admission_id = current_row.admission_id;

  insert into public.agent_execution_receipts (
    receipt_id, admission_id, event_type, task_id, permit_id,
    request_digest, permit_digest, authority_epoch, fencing_token, lease_generation
  )
  select
    p_receipt_id, admission_id, next_event, task_id, permit_id,
    request_digest, permit_digest, authority_epoch, fencing_token, p_lease_generation
  from public.agent_execution_admissions
  where admission_id = current_row.admission_id;

  return true;
end;
$$;

-- Fail closed by default. The generic Supabase service_role is deliberately
-- denied all kernel entrypoints so a compromised application service cannot
-- mint authority, fabricate permit admission, or drive the outbox directly.
-- A later activation migration must grant each function to a distinct,
-- narrowly held issuer / PEP / worker database identity after runtime proof.
revoke execute on function public.initialize_agent_task_authority_v11_5(text, bigint) from public, anon, authenticated, service_role;
revoke execute on function public.transition_agent_task_authority_v11_5(text, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.admit_agent_execution_v11_5(uuid, uuid, uuid, text, text, text, text, text, text, text, bigint, timestamptz, timestamptz, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.lease_agent_execution_outbox_v11_5(text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.record_agent_execution_outcome_v11_5(uuid, uuid, text, bigint, text, text) from public, anon, authenticated, service_role;
