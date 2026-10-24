-- Durable, evidence-only relay ledger for the FCR / Chief / Sol / PromptOS quartet.
-- Fingerprints and proof cookies remain non-secret continuity markers and never authority.

create table if not exists public.federated_relay_public_keys (
  key_id text primary key,
  member text not null,
  algorithm text not null default 'Ed25519',
  public_key_jwk jsonb not null,
  state text not null default 'active',
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint federated_relay_public_keys_member_check
    check (member in ('founder-control-room', 'chief-ai-machine', 'solcontinuity', 'promptos')),
  constraint federated_relay_public_keys_algorithm_check check (algorithm = 'Ed25519'),
  constraint federated_relay_public_keys_state_check check (state in ('active', 'retired', 'revoked')),
  constraint federated_relay_public_keys_validity_check
    check (valid_until is null or valid_until > valid_from),
  constraint federated_relay_public_keys_revocation_check
    check ((state = 'revoked') = (revoked_at is not null)),
  constraint federated_relay_public_keys_member_key_unique unique (member, key_id)
);

create table if not exists public.federated_relay_sequence_counters (
  member text not null,
  key_id text not null,
  next_sequence bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (member, key_id),
  constraint federated_relay_sequence_member_key_fk
    foreign key (member, key_id)
    references public.federated_relay_public_keys(member, key_id)
    on update cascade on delete restrict,
  constraint federated_relay_sequence_nonnegative check (next_sequence >= 0)
);

create table if not exists public.federated_relay_messages (
  message_id uuid primary key,
  contract text not null,
  message_fingerprint text not null,
  chain_id uuid not null,
  chain_position bigint not null,
  logical_operation_id uuid not null,
  source_member text not null,
  source_repository text not null,
  source_branch text not null,
  source_head_sha text not null,
  source_key_id text not null,
  source_sequence bigint not null,
  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  target_head_sha text not null,
  nonce uuid not null,
  predecessor_message_id uuid,
  reply_to_message_id uuid,
  predecessor_proof_cookie text not null,
  successor_proof_cookie text not null,
  payload_sha256 text not null,
  evidence_digest text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  envelope jsonb not null,
  receipt jsonb not null,
  supersedes_message_ids uuid[] not null default '{}',
  status text not null default 'accepted',
  accepted_at timestamptz not null default clock_timestamp(),
  constraint federated_relay_messages_contract_check check (contract = 'juss/federated-agent-relay@v3'),
  constraint federated_relay_messages_member_check
    check (
      source_member in ('founder-control-room', 'chief-ai-machine', 'solcontinuity', 'promptos')
      and target_member in ('founder-control-room', 'chief-ai-machine', 'solcontinuity', 'promptos')
      and source_member <> target_member
    ),
  constraint federated_relay_messages_sha_check
    check (
      source_head_sha ~ '^[0-9a-f]{40}$'
      and target_head_sha ~ '^[0-9a-f]{40}$'
      and message_fingerprint ~ '^[0-9a-f]{64}$'
      and payload_sha256 ~ '^[0-9a-f]{64}$'
      and evidence_digest ~ '^[0-9a-f]{64}$'
    ),
  constraint federated_relay_messages_sequence_check check (source_sequence >= 0),
  constraint federated_relay_messages_chain_position_check check (chain_position >= 0),
  constraint federated_relay_messages_time_check check (expires_at > issued_at),
  constraint federated_relay_messages_status_check check (status in ('accepted', 'superseded')),
  constraint federated_relay_messages_source_key_fk
    foreign key (source_member, source_key_id)
    references public.federated_relay_public_keys(member, key_id)
    on update cascade on delete restrict,
  constraint federated_relay_messages_predecessor_fk
    foreign key (predecessor_message_id)
    references public.federated_relay_messages(message_id)
    on delete restrict,
  constraint federated_relay_messages_reply_fk
    foreign key (reply_to_message_id)
    references public.federated_relay_messages(message_id)
    on delete restrict,
  constraint federated_relay_messages_source_sequence_unique
    unique (source_member, source_key_id, source_sequence),
  constraint federated_relay_messages_nonce_unique unique (source_member, nonce),
  constraint federated_relay_messages_chain_position_unique unique (chain_id, chain_position)
);

create index if not exists federated_relay_messages_logical_operation_idx
  on public.federated_relay_messages(logical_operation_id, accepted_at);
create index if not exists federated_relay_messages_source_idx
  on public.federated_relay_messages(source_member, source_sequence);
create index if not exists federated_relay_messages_target_idx
  on public.federated_relay_messages(target_member, accepted_at desc);

create table if not exists public.federated_relay_reply_reservations (
  parent_message_id uuid not null,
  source_member text not null,
  source_key_id text not null,
  source_sequence bigint not null,
  reply_message_id uuid not null unique,
  reply_nonce uuid not null unique,
  reserved_at timestamptz not null default clock_timestamp(),
  primary key (parent_message_id, source_member, source_key_id),
  constraint federated_relay_reply_parent_fk
    foreign key (parent_message_id)
    references public.federated_relay_messages(message_id)
    on delete restrict,
  constraint federated_relay_reply_key_fk
    foreign key (source_member, source_key_id)
    references public.federated_relay_public_keys(member, key_id)
    on update cascade on delete restrict,
  constraint federated_relay_reply_sequence_unique
    unique (source_member, source_key_id, source_sequence)
);

alter table public.federated_relay_public_keys enable row level security;
alter table public.federated_relay_sequence_counters enable row level security;
alter table public.federated_relay_messages enable row level security;
alter table public.federated_relay_reply_reservations enable row level security;

revoke all on public.federated_relay_public_keys from public, anon, authenticated;
revoke all on public.federated_relay_sequence_counters from public, anon, authenticated;
revoke all on public.federated_relay_messages from public, anon, authenticated;
revoke all on public.federated_relay_reply_reservations from public, anon, authenticated;

grant select, insert, update on public.federated_relay_public_keys to service_role;
grant select on public.federated_relay_messages to service_role;

create or replace function public.federated_relay_reserve_sequence_v3(
  p_member text,
  p_key_id text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sequence bigint;
begin
  if p_member not in ('founder-control-room', 'chief-ai-machine', 'solcontinuity', 'promptos') then
    raise exception 'relay_member_invalid';
  end if;

  if not exists (
    select 1
    from public.federated_relay_public_keys k
    where k.member = p_member
      and k.key_id = p_key_id
      and k.algorithm = 'Ed25519'
      and k.state = 'active'
      and k.revoked_at is null
      and k.valid_from <= clock_timestamp()
      and (k.valid_until is null or k.valid_until >= clock_timestamp())
  ) then
    raise exception 'relay_signing_key_not_current';
  end if;

  insert into public.federated_relay_sequence_counters(member, key_id, next_sequence)
  values (p_member, p_key_id, 1)
  on conflict (member, key_id) do update
    set next_sequence = public.federated_relay_sequence_counters.next_sequence + 1,
        updated_at = clock_timestamp()
  returning next_sequence - 1 into v_sequence;

  return v_sequence;
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
set search_path = pg_catalog, public
as $$
declare
  v_existing public.federated_relay_messages%rowtype;
  v_parent public.federated_relay_messages%rowtype;
  v_superseded uuid;
begin
  if p_contract <> 'juss/federated-agent-relay@v3' then
    raise exception 'relay_contract_unsupported';
  end if;
  if p_source_member not in ('founder-control-room', 'chief-ai-machine', 'solcontinuity', 'promptos')
     or p_target_member not in ('founder-control-room', 'chief-ai-machine', 'solcontinuity', 'promptos')
     or p_source_member = p_target_member then
    raise exception 'relay_member_invalid';
  end if;
  if p_chain_position < 0 or p_source_sequence < 0 then
    raise exception 'relay_ordering_invalid';
  end if;
  if p_expires_at <= p_issued_at or p_expires_at < clock_timestamp() then
    raise exception 'relay_expired';
  end if;
  if p_source_head_sha !~ '^[0-9a-f]{40}$'
     or p_target_head_sha !~ '^[0-9a-f]{40}$'
     or p_message_fingerprint !~ '^[0-9a-f]{64}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_evidence_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'relay_digest_or_identity_invalid';
  end if;
  if p_envelope is null or p_receipt is null then
    raise exception 'relay_persistence_payload_missing';
  end if;
  if p_envelope->>'contract' <> p_contract
     or p_envelope->>'messageId' <> p_message_id::text
     or p_receipt->>'contract' <> p_contract
     or p_receipt->>'messageId' <> p_message_id::text
     or p_receipt->>'successorProofCookie' <> p_successor_proof_cookie then
    raise exception 'relay_persistence_binding_invalid';
  end if;
  if not (p_receipt @> '{"executionAuthorized":false,"authorityTransferred":false,"approvalCarriedForward":false}'::jsonb) then
    raise exception 'relay_authority_receipt_invalid';
  end if;

  select * into v_existing
  from public.federated_relay_messages
  where message_id = p_message_id;
  if found then
    if v_existing.message_fingerprint <> p_message_fingerprint then
      raise exception 'relay_message_id_collision';
    end if;
    return query select 'duplicate'::text, v_existing.receipt;
    return;
  end if;

  if exists (
    select 1 from public.federated_relay_messages
    where source_member = p_source_member
      and source_key_id = p_source_key_id
      and source_sequence = p_source_sequence
  ) then
    raise exception 'relay_source_sequence_collision';
  end if;
  if exists (
    select 1 from public.federated_relay_messages
    where source_member = p_source_member and nonce = p_nonce
  ) then
    raise exception 'relay_nonce_collision';
  end if;
  if exists (
    select 1 from public.federated_relay_messages
    where chain_id = p_chain_id and chain_position = p_chain_position
  ) then
    raise exception 'relay_chain_position_collision';
  end if;

  if p_chain_position = 0 then
    if p_predecessor_message_id is not null or p_reply_to_message_id is not null then
      raise exception 'relay_root_lineage_invalid';
    end if;
  else
    if p_predecessor_message_id is null then
      raise exception 'relay_predecessor_missing';
    end if;
    select * into v_parent
    from public.federated_relay_messages
    where message_id = p_predecessor_message_id;
    if not found then
      raise exception 'relay_predecessor_missing';
    end if;
    if v_parent.chain_id <> p_chain_id
       or v_parent.logical_operation_id <> p_logical_operation_id
       or v_parent.chain_position + 1 <> p_chain_position then
      raise exception 'relay_chain_lineage_invalid';
    end if;
    if v_parent.successor_proof_cookie <> p_predecessor_proof_cookie then
      raise exception 'relay_proof_cookie_lineage_invalid';
    end if;
    if v_parent.target_member <> p_source_member
       or v_parent.source_member <> p_target_member
       or v_parent.target_repository <> p_source_repository
       or v_parent.source_repository <> p_target_repository then
      raise exception 'relay_reply_direction_invalid';
    end if;
    if p_reply_to_message_id is not null and p_reply_to_message_id <> p_predecessor_message_id then
      raise exception 'relay_reply_predecessor_mismatch';
    end if;
  end if;

  if exists (
    select 1
    from public.federated_relay_public_keys k
    where k.member = p_source_member
      and k.key_id = p_source_key_id
      and k.state = 'active'
      and k.revoked_at is null
      and k.valid_from <= p_issued_at
      and (k.valid_until is null or k.valid_until >= p_issued_at)
  ) is false then
    raise exception 'relay_signing_key_not_current';
  end if;

  foreach v_superseded in array coalesce(p_supersedes_message_ids, '{}'::uuid[]) loop
    if v_superseded = p_message_id then
      raise exception 'relay_supersession_self_rejected';
    end if;
    if not exists (
      select 1 from public.federated_relay_messages
      where message_id = v_superseded
        and logical_operation_id = p_logical_operation_id
    ) then
      raise exception 'relay_supersession_invalid';
    end if;
  end loop;

  begin
    insert into public.federated_relay_messages(
      message_id, contract, message_fingerprint, chain_id, chain_position, logical_operation_id,
      source_member, source_repository, source_branch, source_head_sha, source_key_id, source_sequence,
      target_member, target_repository, target_branch, target_head_sha, nonce,
      predecessor_message_id, reply_to_message_id,
      predecessor_proof_cookie, successor_proof_cookie, payload_sha256, evidence_digest,
      issued_at, expires_at, envelope, receipt, supersedes_message_ids
    ) values (
      p_message_id, p_contract, p_message_fingerprint, p_chain_id, p_chain_position, p_logical_operation_id,
      p_source_member, p_source_repository, p_source_branch, p_source_head_sha, p_source_key_id, p_source_sequence,
      p_target_member, p_target_repository, p_target_branch, p_target_head_sha, p_nonce,
      p_predecessor_message_id, p_reply_to_message_id,
      p_predecessor_proof_cookie, p_successor_proof_cookie, p_payload_sha256, p_evidence_digest,
      p_issued_at, p_expires_at, p_envelope, p_receipt, coalesce(p_supersedes_message_ids, '{}'::uuid[])
    );
  exception when unique_violation then
    select * into v_existing
    from public.federated_relay_messages
    where message_id = p_message_id;
    if found and v_existing.message_fingerprint = p_message_fingerprint then
      return query select 'duplicate'::text, v_existing.receipt;
      return;
    end if;
    raise exception 'relay_uniqueness_collision';
  end;

  foreach v_superseded in array coalesce(p_supersedes_message_ids, '{}'::uuid[]) loop
    update public.federated_relay_messages
      set status = 'superseded'
      where message_id = v_superseded and status = 'accepted';
  end loop;

  return query select 'accepted'::text, p_receipt;
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
set search_path = pg_catalog, public
as $$
declare
  v_parent public.federated_relay_messages%rowtype;
  v_existing public.federated_relay_reply_reservations%rowtype;
  v_sequence bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_parent_message_id::text || ':' || p_source_member || ':' || p_source_key_id, 0));

  select * into v_existing
  from public.federated_relay_reply_reservations
  where parent_message_id = p_parent_message_id
    and source_member = p_source_member
    and source_key_id = p_source_key_id;
  if found then
    return query select v_existing.source_sequence, v_existing.reply_message_id, v_existing.reply_nonce, v_existing.reserved_at;
    return;
  end if;

  select * into v_parent
  from public.federated_relay_messages
  where message_id = p_parent_message_id;
  if not found then
    raise exception 'relay_reply_parent_missing';
  end if;
  if v_parent.target_member <> p_source_member then
    raise exception 'relay_reply_source_mismatch';
  end if;

  v_sequence := public.federated_relay_reserve_sequence_v3(p_source_member, p_source_key_id);

  insert into public.federated_relay_reply_reservations(
    parent_message_id, source_member, source_key_id, source_sequence, reply_message_id, reply_nonce
  ) values (
    p_parent_message_id, p_source_member, p_source_key_id, v_sequence, gen_random_uuid(), gen_random_uuid()
  )
  returning * into v_existing;

  return query select v_existing.source_sequence, v_existing.reply_message_id, v_existing.reply_nonce, v_existing.reserved_at;
end;
$$;

revoke all on function public.federated_relay_reserve_sequence_v3(text, text) from public, anon, authenticated;
revoke all on function public.federated_relay_accept_v3(
  text, uuid, text, uuid, bigint, uuid, text, text, text, text, text, bigint,
  text, text, text, text, uuid, uuid, uuid, text, text, text, text,
  timestamptz, timestamptz, jsonb, jsonb, uuid[]
) from public, anon, authenticated;
revoke all on function public.federated_relay_reserve_reply_v3(uuid, text, text) from public, anon, authenticated;

grant execute on function public.federated_relay_reserve_sequence_v3(text, text) to service_role;
grant execute on function public.federated_relay_accept_v3(
  text, uuid, text, uuid, bigint, uuid, text, text, text, text, text, bigint,
  text, text, text, text, uuid, uuid, uuid, text, text, text, text,
  timestamptz, timestamptz, jsonb, jsonb, uuid[]
) to service_role;
grant execute on function public.federated_relay_reserve_reply_v3(uuid, text, text) to service_role;
