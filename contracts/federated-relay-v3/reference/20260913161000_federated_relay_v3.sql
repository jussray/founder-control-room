-- Federated Agent Relay v3 durable truth plane.
-- Evidence transport only: acceptance never grants execution, merge, deploy,
-- publication, provider-mutation, or founder authority.

create extension if not exists pgcrypto;

create table if not exists public.federated_relay_public_keys (
  id uuid primary key default gen_random_uuid(),
  member text not null,
  key_id text not null unique,
  algorithm text not null check (algorithm = 'Ed25519'),
  public_key_jwk jsonb not null,
  state text not null check (state in ('active', 'retiring', 'revoked')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint federated_relay_key_window_valid
    check (valid_until is null or valid_until > valid_from),
  constraint federated_relay_key_revocation_consistent
    check (state <> 'revoked' or revoked_at is not null)
);

create index if not exists federated_relay_public_keys_member_idx
  on public.federated_relay_public_keys (member, state, valid_from);

create table if not exists public.federated_relay_messages (
  id uuid primary key default gen_random_uuid(),
  contract text not null check (contract = 'juss/federated-agent-relay@v3'),
  message_id uuid not null unique,
  message_fingerprint char(64) not null,
  chain_id uuid not null,
  chain_position bigint not null check (chain_position >= 0),
  logical_operation_id uuid not null,
  source_member text not null,
  source_repository text not null,
  source_branch text not null,
  source_head_sha char(40) not null,
  source_key_id text not null references public.federated_relay_public_keys(key_id) on delete restrict,
  source_sequence bigint not null check (source_sequence >= 0),
  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  target_head_sha char(40) not null,
  nonce uuid not null,
  predecessor_message_id uuid,
  reply_to_message_id uuid,
  predecessor_proof_cookie text not null,
  successor_proof_cookie text not null,
  payload_sha256 char(64) not null,
  evidence_digest char(64) not null,
  status text not null default 'accepted' check (status in ('accepted', 'superseded', 'revoked')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_message_id uuid references public.federated_relay_messages(message_id) on delete restrict,
  envelope jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  constraint federated_relay_expiry_after_issue check (expires_at > issued_at),
  constraint federated_relay_reply_matches_predecessor check (
    (reply_to_message_id is null and predecessor_message_id is null)
    or (reply_to_message_id is not null and predecessor_message_id = reply_to_message_id)
  ),
  constraint federated_relay_unique_sender_sequence
    unique (source_member, source_key_id, source_sequence),
  constraint federated_relay_unique_key_nonce
    unique (source_key_id, nonce),
  constraint federated_relay_unique_chain_position
    unique (chain_id, chain_position)
);

create index if not exists federated_relay_messages_chain_idx
  on public.federated_relay_messages (chain_id, chain_position);
create index if not exists federated_relay_messages_source_idx
  on public.federated_relay_messages (source_member, source_key_id, source_sequence);
create index if not exists federated_relay_messages_operation_idx
  on public.federated_relay_messages (logical_operation_id, chain_id);
create index if not exists federated_relay_messages_reply_idx
  on public.federated_relay_messages (reply_to_message_id)
  where reply_to_message_id is not null;

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
  on public.federated_relay_supersessions (successor_message_id);

alter table public.federated_relay_messages enable row level security;
alter table public.federated_relay_supersessions enable row level security;
alter table public.federated_relay_public_keys enable row level security;

revoke all on table public.federated_relay_messages from public, anon, authenticated;
revoke all on table public.federated_relay_supersessions from public, anon, authenticated;
revoke all on table public.federated_relay_public_keys from public, anon, authenticated;

-- Durable messages and graph edges are append/update only through the atomic
-- SECURITY DEFINER RPC. service_role may inspect them but cannot bypass the
-- anti-replay/ordering/supersession transaction with direct writes.
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_messages from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_supersessions from service_role;
grant select on table public.federated_relay_messages to service_role;
grant select on table public.federated_relay_supersessions to service_role;

-- Key configuration is server-only evidence configuration. Private keys are
-- never stored here; only public JWKs are durable.
grant select, insert, update on table public.federated_relay_public_keys to service_role;
revoke delete, truncate, references, trigger on table public.federated_relay_public_keys from service_role;

create or replace function public.federated_relay_accept_v3(
  p_contract text,
  p_message_id uuid,
  p_message_fingerprint char(64),
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
  p_payload_sha256 char(64),
  p_evidence_digest char(64),
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_envelope jsonb,
  p_receipt jsonb,
  p_supersedes_message_ids uuid[]
)
returns table (
  outcome text,
  stored_receipt jsonb
)
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
  if p_supersedes_message_ids is null then
    p_supersedes_message_ids := array[]::uuid[];
  end if;

  -- All acceptance calls acquire locks in this order. The source lock makes
  -- sequence monotonicity race-safe. The chain lock prevents reply/supersession
  -- forks. The message lock makes concurrent exact delivery truly idempotent.
  perform pg_advisory_xact_lock(hashtextextended('relay:source:' || p_source_member || ':' || p_source_key_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('relay:chain:' || p_chain_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('relay:message:' || p_message_id::text, 0));

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

    if not found then
      raise exception 'relay_reply_parent_missing';
    end if;
    if parent_record.status <> 'accepted' then
      raise exception 'relay_reply_parent_inactive';
    end if;
    if parent_record.chain_id <> p_chain_id then
      raise exception 'relay_reply_cross_chain';
    end if;
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
    if p_chain_position <> 0 then
      raise exception 'relay_root_chain_position_invalid';
    end if;
    if p_predecessor_message_id is not null then
      raise exception 'relay_root_has_predecessor';
    end if;
  end if;

  foreach superseded_id in array p_supersedes_message_ids
  loop
    if superseded_id = p_message_id then
      raise exception 'relay_self_supersession';
    end if;

    select * into superseded_record
      from public.federated_relay_messages
     where message_id = superseded_id
     for update;

    if not found then
      raise exception 'relay_supersession_missing';
    end if;
    if superseded_record.status <> 'accepted' then
      raise exception 'relay_supersession_inactive';
    end if;
    if superseded_record.chain_id <> p_chain_id then
      raise exception 'relay_cross_chain_supersession';
    end if;
    if superseded_record.source_member <> p_source_member then
      raise exception 'relay_foreign_supersession';
    end if;
    if superseded_record.source_key_id <> p_source_key_id then
      raise exception 'relay_cross_key_supersession';
    end if;
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
    and p_receipt ->> 'messageFingerprint' = p_message_fingerprint::text
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
    and p_envelope #>> '{payload,sha256}' = p_payload_sha256::text
  ) then
    raise exception 'relay_envelope_parameter_mismatch';
  end if;

  insert into public.federated_relay_messages (
    contract, message_id, message_fingerprint,
    chain_id, chain_position, logical_operation_id,
    source_member, source_repository, source_branch, source_head_sha,
    source_key_id, source_sequence,
    target_member, target_repository, target_branch, target_head_sha,
    nonce, predecessor_message_id, reply_to_message_id,
    predecessor_proof_cookie, successor_proof_cookie,
    payload_sha256, evidence_digest, status,
    issued_at, expires_at, envelope, receipt
  ) values (
    p_contract, p_message_id, p_message_fingerprint,
    p_chain_id, p_chain_position, p_logical_operation_id,
    p_source_member, p_source_repository, p_source_branch, p_source_head_sha,
    p_source_key_id, p_source_sequence,
    p_target_member, p_target_repository, p_target_branch, p_target_head_sha,
    p_nonce, p_predecessor_message_id, p_reply_to_message_id,
    p_predecessor_proof_cookie, p_successor_proof_cookie,
    p_payload_sha256, p_evidence_digest, 'accepted',
    p_issued_at, p_expires_at, p_envelope, p_receipt
  );

  foreach superseded_id in array p_supersedes_message_ids
  loop
    update public.federated_relay_messages
       set status = 'superseded',
           superseded_at = now(),
           superseded_by_message_id = p_message_id
     where message_id = superseded_id;

    insert into public.federated_relay_supersessions (
      predecessor_message_id, successor_message_id, chain_id, logical_operation_id
    ) values (
      superseded_id, p_message_id, p_chain_id, p_logical_operation_id
    );
  end loop;

  return query select 'accepted'::text, p_receipt;
end;
$$;

revoke all on function public.federated_relay_accept_v3(
  text, uuid, char(64), uuid, bigint, uuid,
  text, text, text, text, text, bigint,
  text, text, text, text, uuid, uuid, uuid,
  text, text, char(64), char(64), timestamptz, timestamptz,
  jsonb, jsonb, uuid[]
) from public, anon, authenticated;

grant execute on function public.federated_relay_accept_v3(
  text, uuid, char(64), uuid, bigint, uuid,
  text, text, text, text, text, bigint,
  text, text, text, text, uuid, uuid, uuid,
  text, text, char(64), char(64), timestamptz, timestamptz,
  jsonb, jsonb, uuid[]
) to service_role;

comment on table public.federated_relay_messages is
  'Append-only durable evidence-conversation ledger for signed federated-agent relay v3. Never an authority grant.';
comment on table public.federated_relay_public_keys is
  'Server-only public signing-key registry for federated-agent relay v3. No private key material.';
comment on function public.federated_relay_accept_v3 is
  'Atomic idempotent relay acceptance. Application must verify Ed25519 signature and exact local target identity before invoking.';
