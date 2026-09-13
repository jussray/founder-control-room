-- Reconcile the already-live 18:00 federated relay v3 ledger with the
-- stricter graph, replay, and idempotency contract carried by PR #797.
-- Evidence transport only. No relay receipt grants execution, merge, deploy,
-- publication, provider mutation, or founder authority.

DO $$
BEGIN
  IF to_regclass('public.federated_relay_messages') IS NULL
     OR to_regclass('public.federated_relay_public_keys') IS NULL
     OR to_regclass('public.federated_relay_reply_reservations') IS NULL THEN
    RAISE EXCEPTION 'relay_v3_live_baseline_missing';
  END IF;
END;
$$;

-- Preserve historical rows while adding explicit graph/supersession truth.
alter table public.federated_relay_messages
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_message_id uuid;

create table if not exists public.federated_relay_supersessions (
  predecessor_message_id uuid not null
    references public.federated_relay_messages(message_id) on delete restrict,
  successor_message_id uuid not null
    references public.federated_relay_messages(message_id) on delete restrict,
  chain_id uuid not null,
  logical_operation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (predecessor_message_id, successor_message_id),
  unique (predecessor_message_id),
  constraint federated_relay_no_self_supersession
    check (predecessor_message_id <> successor_message_id)
);

create index if not exists federated_relay_supersessions_successor_idx
  on public.federated_relay_supersessions(successor_message_id);

-- The live 18:00 allocator used next_sequence; the canonical allocator stores
-- the last reserved sender sequence. Preserve any reservations if they exist.
create table if not exists public.federated_relay_source_sequences (
  member text not null,
  key_id text not null,
  last_sequence bigint not null check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (member, key_id),
  constraint federated_relay_source_sequences_key_fk
    foreign key (member, key_id)
    references public.federated_relay_public_keys(member, key_id)
    on update cascade on delete restrict
);

insert into public.federated_relay_source_sequences(member, key_id, last_sequence, updated_at)
select member, key_id, greatest(next_sequence - 1, 0), updated_at
from public.federated_relay_sequence_counters
on conflict (member, key_id) do update
  set last_sequence = greatest(
        public.federated_relay_source_sequences.last_sequence,
        excluded.last_sequence
      ),
      updated_at = greatest(
        public.federated_relay_source_sequences.updated_at,
        excluded.updated_at
      );

-- Normalize the key lifecycle vocabulary without rewriting key identity.
update public.federated_relay_public_keys
set state = 'retiring', updated_at = now()
where state = 'retired';

alter table public.federated_relay_public_keys
  drop constraint if exists federated_relay_public_keys_state_check;
alter table public.federated_relay_public_keys
  add constraint federated_relay_public_keys_state_check
    check (state in ('active', 'retiring', 'revoked'));

-- Support explicit revocation state and bind nonces to signing identity, not
-- only member identity.
alter table public.federated_relay_messages
  drop constraint if exists federated_relay_messages_status_check;
alter table public.federated_relay_messages
  add constraint federated_relay_messages_status_check
    check (status in ('accepted', 'superseded', 'revoked'));

alter table public.federated_relay_messages
  drop constraint if exists federated_relay_messages_nonce_unique;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.federated_relay_messages'::regclass
      AND conname = 'federated_relay_messages_key_nonce_unique'
  ) THEN
    alter table public.federated_relay_messages
      add constraint federated_relay_messages_key_nonce_unique
      unique (source_key_id, nonce);
  END IF;
END;
$$;

-- One accepted parent has one durable reply identity. Fail closed if an older
-- deployment somehow produced multiple reservations for one parent.
DO $$
BEGIN
  IF EXISTS (
    SELECT parent_message_id
    FROM public.federated_relay_reply_reservations
    GROUP BY parent_message_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'relay_reply_reservation_fork_present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.federated_relay_reply_reservations'::regclass
      AND conname = 'federated_relay_reply_parent_unique'
  ) THEN
    alter table public.federated_relay_reply_reservations
      add constraint federated_relay_reply_parent_unique unique (parent_message_id);
  END IF;
END;
$$;

-- Validate and materialize any historical array-form supersession before the
-- relation table becomes authoritative.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.federated_relay_messages successor
    CROSS JOIN LATERAL unnest(successor.supersedes_message_ids) AS edge(predecessor_id)
    LEFT JOIN public.federated_relay_messages predecessor
      ON predecessor.message_id = edge.predecessor_id
    WHERE predecessor.message_id IS NULL
       OR predecessor.chain_id <> successor.chain_id
       OR predecessor.logical_operation_id <> successor.logical_operation_id
       OR predecessor.source_member <> successor.source_member
       OR predecessor.source_key_id <> successor.source_key_id
       OR predecessor.chain_position >= successor.chain_position
       OR predecessor.source_sequence >= successor.source_sequence
  ) THEN
    RAISE EXCEPTION 'relay_historical_supersession_invalid';
  END IF;

  IF EXISTS (
    SELECT edge.predecessor_id
    FROM public.federated_relay_messages successor
    CROSS JOIN LATERAL unnest(successor.supersedes_message_ids) AS edge(predecessor_id)
    GROUP BY edge.predecessor_id
    HAVING count(distinct successor.message_id) > 1
  ) THEN
    RAISE EXCEPTION 'relay_historical_supersession_fork';
  END IF;
END;
$$;

insert into public.federated_relay_supersessions(
  predecessor_message_id,
  successor_message_id,
  chain_id,
  logical_operation_id,
  created_at
)
select
  edge.predecessor_id,
  successor.message_id,
  successor.chain_id,
  successor.logical_operation_id,
  successor.accepted_at
from public.federated_relay_messages successor
cross join lateral unnest(successor.supersedes_message_ids) AS edge(predecessor_id)
on conflict (predecessor_message_id, successor_message_id) do nothing;

update public.federated_relay_messages predecessor
set status = 'superseded',
    superseded_at = coalesce(predecessor.superseded_at, successor.accepted_at),
    superseded_by_message_id = successor.message_id
from public.federated_relay_supersessions edge
join public.federated_relay_messages successor
  on successor.message_id = edge.successor_message_id
where predecessor.message_id = edge.predecessor_message_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.federated_relay_messages'::regclass
      AND conname = 'federated_relay_messages_superseded_by_fk'
  ) THEN
    alter table public.federated_relay_messages
      add constraint federated_relay_messages_superseded_by_fk
      foreign key (superseded_by_message_id)
      references public.federated_relay_messages(message_id)
      on delete restrict;
  END IF;
END;
$$;

alter table public.federated_relay_supersessions enable row level security;
alter table public.federated_relay_source_sequences enable row level security;

revoke all on table public.federated_relay_messages from public, anon, authenticated;
revoke all on table public.federated_relay_public_keys from public, anon, authenticated;
revoke all on table public.federated_relay_reply_reservations from public, anon, authenticated;
revoke all on table public.federated_relay_sequence_counters from public, anon, authenticated;
revoke all on table public.federated_relay_supersessions from public, anon, authenticated;
revoke all on table public.federated_relay_source_sequences from public, anon, authenticated;

-- Mutation must go through the SECURITY DEFINER functions below.
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_messages from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_supersessions from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_reply_reservations from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_source_sequences from service_role;
revoke all on table public.federated_relay_sequence_counters from service_role;

grant select on table public.federated_relay_messages to service_role;
grant select on table public.federated_relay_supersessions to service_role;
grant select on table public.federated_relay_reply_reservations to service_role;
grant select on table public.federated_relay_source_sequences to service_role;
grant select, insert, update on table public.federated_relay_public_keys to service_role;

create or replace function public.federated_relay_reserve_sequence_v3(
  p_member text,
  p_key_id text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  key_record public.federated_relay_public_keys%rowtype;
  reserved_sequence bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('relay:source:' || p_member || ':' || p_key_id, 0));

  select * into key_record
    from public.federated_relay_public_keys
   where key_id = p_key_id
   for share;

  if not found then
    raise exception 'relay_signing_key_unknown';
  end if;
  if key_record.member <> p_member then
    raise exception 'relay_source_key_member_mismatch';
  end if;
  if key_record.state = 'revoked' or key_record.revoked_at is not null then
    raise exception 'relay_signing_key_revoked';
  end if;
  if now() < key_record.valid_from
     or (key_record.valid_until is not null and now() > key_record.valid_until) then
    raise exception 'relay_signing_key_not_current';
  end if;

  insert into public.federated_relay_source_sequences(member, key_id, last_sequence, updated_at)
  values (p_member, p_key_id, 0, now())
  on conflict (member, key_id) do update
    set last_sequence = public.federated_relay_source_sequences.last_sequence + 1,
        updated_at = now()
  returning last_sequence into reserved_sequence;

  return reserved_sequence;
end;
$$;

create or replace function public.federated_relay_reserve_reply_v3(
  p_parent_message_id uuid,
  p_source_member text,
  p_source_key_id text
)
returns table(
  source_sequence bigint,
  reply_message_id uuid,
  reply_nonce uuid,
  reserved_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  parent_record public.federated_relay_messages%rowtype;
  key_record public.federated_relay_public_keys%rowtype;
  existing_reservation public.federated_relay_reply_reservations%rowtype;
  reserved_sequence bigint;
  reserved_message_id uuid;
  reserved_nonce uuid;
  reservation_time timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended('relay:reply:' || p_parent_message_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('relay:source:' || p_source_member || ':' || p_source_key_id, 0));

  select * into parent_record
    from public.federated_relay_messages
   where message_id = p_parent_message_id
   for update;

  if not found then
    raise exception 'relay_reply_parent_missing';
  end if;
  if parent_record.status <> 'accepted' then
    raise exception 'relay_reply_parent_inactive';
  end if;
  if parent_record.target_member <> p_source_member then
    raise exception 'relay_reply_identity_not_inverted';
  end if;

  select * into key_record
    from public.federated_relay_public_keys
   where key_id = p_source_key_id
   for share;
  if not found then
    raise exception 'relay_signing_key_unknown';
  end if;
  if key_record.member <> p_source_member then
    raise exception 'relay_source_key_member_mismatch';
  end if;
  if key_record.state = 'revoked' or key_record.revoked_at is not null then
    raise exception 'relay_signing_key_revoked';
  end if;

  select * into existing_reservation
    from public.federated_relay_reply_reservations
   where parent_message_id = p_parent_message_id;
  if found then
    if existing_reservation.source_member <> p_source_member
       or existing_reservation.source_key_id <> p_source_key_id then
      raise exception 'relay_reply_reservation_identity_mismatch';
    end if;
    return query select
      existing_reservation.source_sequence,
      existing_reservation.reply_message_id,
      existing_reservation.reply_nonce,
      existing_reservation.reserved_at;
    return;
  end if;

  insert into public.federated_relay_source_sequences(member, key_id, last_sequence, updated_at)
  values (p_source_member, p_source_key_id, 0, reservation_time)
  on conflict (member, key_id) do update
    set last_sequence = public.federated_relay_source_sequences.last_sequence + 1,
        updated_at = reservation_time
  returning last_sequence into reserved_sequence;

  reserved_message_id := gen_random_uuid();
  reserved_nonce := gen_random_uuid();

  insert into public.federated_relay_reply_reservations(
    parent_message_id, source_member, source_key_id, source_sequence,
    reply_message_id, reply_nonce, reserved_at
  ) values (
    p_parent_message_id, p_source_member, p_source_key_id, reserved_sequence,
    reserved_message_id, reserved_nonce, reservation_time
  );

  return query select reserved_sequence, reserved_message_id, reserved_nonce, reservation_time;
end;
$$;

create or replace function public.federated_relay_accept_v3(
  p_contract text,
  p_message_id uuid,
  p_message_fingerprint text,
  p_chain_id uuid,
  p_chain_position bigint,
  p_logical_operation_id uuid,
  p_source_member text,
  p_source_repository text,
  p_source_branch text,
  p_source_head_sha text,
  p_source_key_id text,
  p_source_sequence bigint,
  p_target_member text,
  p_target_repository text,
  p_target_branch text,
  p_target_head_sha text,
  p_nonce uuid,
  p_predecessor_message_id uuid,
  p_reply_to_message_id uuid,
  p_predecessor_proof_cookie text,
  p_successor_proof_cookie text,
  p_payload_sha256 text,
  p_evidence_digest text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_envelope jsonb,
  p_receipt jsonb,
  p_supersedes_message_ids uuid[]
)
returns table(outcome text, stored_receipt jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing_record public.federated_relay_messages%rowtype;
  parent_record public.federated_relay_messages%rowtype;
  superseded_record public.federated_relay_messages%rowtype;
  key_record public.federated_relay_public_keys%rowtype;
  superseded_id uuid;
  latest_sequence bigint;
begin
  if p_supersedes_message_ids is null then
    p_supersedes_message_ids := array[]::uuid[];
  end if;

  -- Serialize the three identities that can race: sender, chain, message.
  perform pg_advisory_xact_lock(hashtextextended('relay:source:' || p_source_member || ':' || p_source_key_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('relay:chain:' || p_chain_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('relay:message:' || p_message_id::text, 0));

  -- Exact duplicate delivery is idempotent even after the original TTL. The
  -- receiver HTTP layer still re-binds the packet to its exact current SHA.
  select * into existing_record
    from public.federated_relay_messages
   where message_id = p_message_id
   for update;
  if found then
    if existing_record.message_fingerprint = p_message_fingerprint then
      return query select 'duplicate'::text, existing_record.receipt;
      return;
    end if;
    raise exception 'relay_message_id_collision';
  end if;

  if p_contract <> 'juss/federated-agent-relay@v3' then
    raise exception 'relay_contract_unsupported';
  end if;
  if p_expires_at <= p_issued_at then
    raise exception 'relay_invalid_expiry';
  end if;
  if p_expires_at < now() then
    raise exception 'relay_expired';
  end if;
  if p_chain_position < 0 or p_source_sequence < 0 then
    raise exception 'relay_ordering_invalid';
  end if;

  select * into key_record
    from public.federated_relay_public_keys
   where key_id = p_source_key_id
   for share;
  if not found then
    raise exception 'relay_signing_key_unknown';
  end if;
  if key_record.member <> p_source_member then
    raise exception 'relay_source_key_member_mismatch';
  end if;
  if key_record.state = 'revoked' or key_record.revoked_at is not null then
    raise exception 'relay_signing_key_revoked';
  end if;
  if p_issued_at < key_record.valid_from
     or (key_record.valid_until is not null and p_issued_at > key_record.valid_until) then
    raise exception 'relay_signing_key_not_current';
  end if;

  select max(source_sequence) into latest_sequence
    from public.federated_relay_messages
   where source_member = p_source_member
     and source_key_id = p_source_key_id;
  if latest_sequence is not null and p_source_sequence <= latest_sequence then
    raise exception 'relay_source_sequence_rollback';
  end if;

  if exists (
    select 1 from public.federated_relay_messages
     where source_key_id = p_source_key_id and nonce = p_nonce
  ) then
    raise exception 'relay_nonce_reuse';
  end if;
  if exists (
    select 1 from public.federated_relay_messages
     where chain_id = p_chain_id and chain_position = p_chain_position
  ) then
    raise exception 'relay_chain_position_reuse';
  end if;

  if p_reply_to_message_id is not null then
    select * into parent_record
      from public.federated_relay_messages
     where message_id = p_reply_to_message_id
     for update;
    if not found then raise exception 'relay_reply_parent_missing'; end if;
    if parent_record.status <> 'accepted' then raise exception 'relay_reply_parent_inactive'; end if;
    if parent_record.chain_id <> p_chain_id then raise exception 'relay_reply_cross_chain'; end if;
    if p_predecessor_message_id is distinct from p_reply_to_message_id then
      raise exception 'relay_reply_predecessor_mismatch';
    end if;
    if p_chain_position <> parent_record.chain_position + 1 then
      raise exception 'relay_reply_chain_position';
    end if;
    if p_source_member <> parent_record.target_member
       or p_source_repository <> parent_record.target_repository
       or p_source_branch <> parent_record.target_branch
       or p_source_head_sha <> parent_record.target_head_sha
       or p_target_member <> parent_record.source_member
       or p_target_repository <> parent_record.source_repository
       or p_target_branch <> parent_record.source_branch
       or p_target_head_sha <> parent_record.source_head_sha then
      raise exception 'relay_reply_identity_not_inverted';
    end if;
    if p_predecessor_proof_cookie <> parent_record.successor_proof_cookie then
      raise exception 'relay_reply_cookie_mismatch';
    end if;
  else
    if p_chain_position <> 0 then raise exception 'relay_root_chain_position_invalid'; end if;
    if p_predecessor_message_id is not null then raise exception 'relay_root_has_predecessor'; end if;
  end if;

  foreach superseded_id in array p_supersedes_message_ids loop
    if superseded_id = p_message_id then raise exception 'relay_self_supersession'; end if;
    select * into superseded_record
      from public.federated_relay_messages
     where message_id = superseded_id
     for update;
    if not found then raise exception 'relay_supersession_missing'; end if;
    if superseded_record.status <> 'accepted' then raise exception 'relay_supersession_inactive'; end if;
    if superseded_record.chain_id <> p_chain_id then raise exception 'relay_cross_chain_supersession'; end if;
    if superseded_record.source_member <> p_source_member then raise exception 'relay_foreign_supersession'; end if;
    if superseded_record.source_key_id <> p_source_key_id then raise exception 'relay_cross_key_supersession'; end if;
    if superseded_record.logical_operation_id <> p_logical_operation_id then
      raise exception 'relay_cross_operation_supersession';
    end if;
    if superseded_record.chain_position >= p_chain_position
       or superseded_record.source_sequence >= p_source_sequence then
      raise exception 'relay_reverse_supersession';
    end if;
    if exists (
      select 1 from public.federated_relay_supersessions
       where predecessor_message_id = superseded_id
    ) then
      raise exception 'relay_supersession_fork';
    end if;
  end loop;

  if not (
    p_receipt @> '{"executionAuthorized":false,"authorityTransferred":false,"approvalCarriedForward":false}'::jsonb
    and p_receipt ->> 'messageId' = p_message_id::text
    and p_receipt ->> 'messageFingerprint' = p_message_fingerprint
    and p_receipt ->> 'successorProofCookie' = p_successor_proof_cookie
  ) then
    raise exception 'relay_receipt_invalid';
  end if;

  if not (
    p_envelope ->> 'contract' = p_contract
    and p_envelope ->> 'messageId' = p_message_id::text
    and p_envelope #>> '{ordering,chainId}' = p_chain_id::text
    and (p_envelope #>> '{ordering,chainPosition}')::bigint = p_chain_position
    and (p_envelope #>> '{ordering,sourceSequence}')::bigint = p_source_sequence
    and p_envelope #>> '{source,member}' = p_source_member
    and p_envelope #>> '{source,repository}' = p_source_repository
    and p_envelope #>> '{source,branch}' = p_source_branch
    and p_envelope #>> '{source,headSha}' = p_source_head_sha
    and p_envelope #>> '{target,member}' = p_target_member
    and p_envelope #>> '{target,repository}' = p_target_repository
    and p_envelope #>> '{target,branch}' = p_target_branch
    and p_envelope #>> '{target,headSha}' = p_target_head_sha
    and p_envelope #>> '{signature,keyId}' = p_source_key_id
    and p_envelope #>> '{payload,sha256}' = p_payload_sha256
  ) then
    raise exception 'relay_envelope_parameter_mismatch';
  end if;

  insert into public.federated_relay_messages(
    message_id, contract, message_fingerprint,
    chain_id, chain_position, logical_operation_id,
    source_member, source_repository, source_branch, source_head_sha,
    source_key_id, source_sequence,
    target_member, target_repository, target_branch, target_head_sha,
    nonce, predecessor_message_id, reply_to_message_id,
    predecessor_proof_cookie, successor_proof_cookie,
    payload_sha256, evidence_digest,
    issued_at, expires_at, envelope, receipt, supersedes_message_ids, status
  ) values (
    p_message_id, p_contract, p_message_fingerprint,
    p_chain_id, p_chain_position, p_logical_operation_id,
    p_source_member, p_source_repository, p_source_branch, p_source_head_sha,
    p_source_key_id, p_source_sequence,
    p_target_member, p_target_repository, p_target_branch, p_target_head_sha,
    p_nonce, p_predecessor_message_id, p_reply_to_message_id,
    p_predecessor_proof_cookie, p_successor_proof_cookie,
    p_payload_sha256, p_evidence_digest,
    p_issued_at, p_expires_at, p_envelope, p_receipt, p_supersedes_message_ids, 'accepted'
  );

  foreach superseded_id in array p_supersedes_message_ids loop
    insert into public.federated_relay_supersessions(
      predecessor_message_id, successor_message_id, chain_id, logical_operation_id
    ) values (
      superseded_id, p_message_id, p_chain_id, p_logical_operation_id
    );

    update public.federated_relay_messages
       set status = 'superseded',
           superseded_at = now(),
           superseded_by_message_id = p_message_id
     where message_id = superseded_id;
  end loop;

  return query select 'accepted'::text, p_receipt;
end;
$$;

revoke all on function public.federated_relay_accept_v3(
  text, uuid, text, uuid, bigint, uuid,
  text, text, text, text, text, bigint,
  text, text, text, text, uuid, uuid, uuid,
  text, text, text, text, timestamptz, timestamptz,
  jsonb, jsonb, uuid[]
) from public, anon, authenticated;
grant execute on function public.federated_relay_accept_v3(
  text, uuid, text, uuid, bigint, uuid,
  text, text, text, text, text, bigint,
  text, text, text, text, uuid, uuid, uuid,
  text, text, text, text, timestamptz, timestamptz,
  jsonb, jsonb, uuid[]
) to service_role;

revoke all on function public.federated_relay_reserve_sequence_v3(text, text)
  from public, anon, authenticated;
grant execute on function public.federated_relay_reserve_sequence_v3(text, text)
  to service_role;

revoke all on function public.federated_relay_reserve_reply_v3(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.federated_relay_reserve_reply_v3(uuid, text, text)
  to service_role;

comment on table public.federated_relay_supersessions is
  'Explicit one-successor graph for federated relay v3 evidence supersession; never authority.';
comment on table public.federated_relay_source_sequences is
  'Atomic per-signing-identity relay v3 sequence allocator; never authority.';
