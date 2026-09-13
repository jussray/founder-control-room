-- Federated relay v3.1 durable evidence ledger.
-- Source-only migration: committing this file does not mutate production.
--
-- FEDERATED RELAY V3.1 INVARIANTS
-- 1. v1/v2 chains are never continued by v3.1; v3.1 roots use a fresh chain_id.
-- 2. One message_id has one immutable receiver-signed receipt_id + receipt forever.
-- 3. Exact signed retries return that stored receipt; mutable current state is separate.
-- 4. LOCK ORDER IS ALWAYS: source cursor -> chain cursor -> message rows -> supersession edge insert.
-- 5. Every non-root message extends the current chain tip exactly once.
-- 6. A root uses Q4R:v3.1:genesis only.
-- 7. Successor cookies are chain-scoped by the application digest contract.
-- 8. Supersession mutates live state but never rewrites historical acceptance receipts.
-- 9. Relay payload is evidence/data only; it never transfers execution authority.
-- 10. Any failure rolls back message insert, receipt, cursor advancement, supersession edges, and state changes together.
-- 11. Only revision messages may supersede prior accepted evidence.
-- 12. Sender retries reuse the exact durable outbox envelope and source sequence.

create extension if not exists "pgcrypto";

create table if not exists public.federated_relay_source_cursors (
  source_member text not null,
  source_key_id text not null,
  last_sequence bigint not null default -1 check (last_sequence >= -1),
  last_message_id uuid,
  updated_at timestamptz not null default now(),
  primary key (source_member, source_key_id)
);

create table if not exists public.federated_relay_chain_cursors (
  chain_id uuid primary key,
  last_position bigint not null default -1 check (last_position >= -1),
  last_message_id uuid,
  last_successor_cookie text not null default 'Q4R:v3.1:genesis',
  updated_at timestamptz not null default now()
);

create table if not exists public.federated_relay_public_keys (
  member text not null,
  key_id text not null,
  algorithm text not null check (algorithm = 'Ed25519'),
  public_key_jwk jsonb not null,
  state text not null check (state in ('active', 'retiring', 'revoked')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member, key_id),
  constraint federated_relay_key_window_valid
    check (valid_until is null or valid_until > valid_from),
  constraint federated_relay_key_revocation_consistent
    check (state <> 'revoked' or revoked_at is not null)
);

create table if not exists public.federated_relay_messages (
  id uuid primary key default gen_random_uuid(),
  contract text not null check (contract = 'juss/federated-agent-relay@v3.1'),

  message_id uuid not null unique,
  semantic_fingerprint char(64) not null,
  delivery_fingerprint char(64) not null,
  receipt_id uuid not null unique,

  chain_id uuid not null,
  chain_position bigint not null check (chain_position >= 0),
  relation_type text not null check (relation_type in ('root', 'reply', 'revision', 'reconcile')),
  parent_message_id uuid references public.federated_relay_messages(message_id) on delete restrict,
  logical_operation_id uuid not null,

  source_member text not null,
  source_repository text not null,
  source_branch text not null,
  source_head_sha char(40) not null,
  source_key_id text not null,
  source_sequence bigint not null check (source_sequence >= 0),

  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  target_head_sha char(40) not null,

  nonce uuid not null,
  reply_to_message_id uuid references public.federated_relay_messages(message_id) on delete restrict,

  predecessor_proof_cookie text not null,
  successor_proof_cookie text not null,
  payload_sha256 char(64) not null,
  evidence_digest char(64) not null,
  accepted_key_state jsonb not null,

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
  constraint federated_relay_unique_sender_sequence
    unique (source_member, source_key_id, source_sequence),
  constraint federated_relay_unique_sender_nonce
    unique (source_member, source_key_id, nonce),
  constraint federated_relay_unique_chain_position
    unique (chain_id, chain_position),
  constraint federated_relay_root_shape check (
    (relation_type = 'root' and chain_position = 0 and parent_message_id is null and reply_to_message_id is null)
    or
    (relation_type <> 'root' and chain_position > 0 and parent_message_id is not null)
  ),
  constraint federated_relay_reply_shape check (
    (relation_type = 'reply' and reply_to_message_id = parent_message_id)
    or
    (relation_type <> 'reply' and reply_to_message_id is null)
  ),
  constraint federated_relay_accepted_key_state_shape check (
    accepted_key_state ? 'member'
    and accepted_key_state ? 'keyId'
    and accepted_key_state ? 'state'
    and accepted_key_state->>'state' in ('active', 'retiring')
  )
);

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

create table if not exists public.federated_relay_outbox (
  message_id uuid primary key,
  chain_id uuid not null,
  source_member text not null,
  source_key_id text not null,
  source_sequence bigint not null check (source_sequence >= 0),
  chain_position bigint not null check (chain_position >= 0),
  semantic_fingerprint char(64),
  delivery_fingerprint char(64),
  envelope jsonb not null,
  delivery_status text not null check (delivery_status in ('draft', 'signed', 'sent', 'accepted', 'duplicate', 'failed')),
  receipt jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  resolved_at timestamptz,
  unique (source_member, source_key_id, source_sequence)
);

create index if not exists federated_relay_messages_chain_idx
  on public.federated_relay_messages (chain_id, chain_position);
create index if not exists federated_relay_messages_operation_idx
  on public.federated_relay_messages (logical_operation_id, chain_id);
create index if not exists federated_relay_messages_reply_idx
  on public.federated_relay_messages (reply_to_message_id)
  where reply_to_message_id is not null;
create index if not exists federated_relay_messages_status_idx
  on public.federated_relay_messages (status, accepted_at desc);
create index if not exists federated_relay_supersessions_successor_idx
  on public.federated_relay_supersessions (successor_message_id);

alter table public.federated_relay_source_cursors enable row level security;
alter table public.federated_relay_chain_cursors enable row level security;
alter table public.federated_relay_public_keys enable row level security;
alter table public.federated_relay_messages enable row level security;
alter table public.federated_relay_supersessions enable row level security;
alter table public.federated_relay_outbox enable row level security;

revoke all on table public.federated_relay_source_cursors from public, anon, authenticated;
revoke all on table public.federated_relay_chain_cursors from public, anon, authenticated;
revoke all on table public.federated_relay_public_keys from public, anon, authenticated;
revoke all on table public.federated_relay_messages from public, anon, authenticated;
revoke all on table public.federated_relay_supersessions from public, anon, authenticated;
revoke all on table public.federated_relay_outbox from public, anon, authenticated;

grant select, insert, update on table public.federated_relay_source_cursors to service_role;
grant select, insert, update on table public.federated_relay_chain_cursors to service_role;
grant select, insert, update on table public.federated_relay_public_keys to service_role;
grant select, insert, update on table public.federated_relay_messages to service_role;
grant select, insert on table public.federated_relay_supersessions to service_role;
grant select, insert, update on table public.federated_relay_outbox to service_role;

create or replace function public.federated_relay_accept_v31(
  p_contract text,
  p_message_id uuid,
  p_semantic_fingerprint char(64),
  p_delivery_fingerprint char(64),
  p_receipt_id uuid,
  p_chain_id uuid,
  p_chain_position bigint,
  p_relation_type text,
  p_parent_message_id uuid,
  p_logical_operation_id uuid,
  p_source_member text,
  p_source_repository text,
  p_source_branch text,
  p_source_head_sha char(40),
  p_source_key_id text,
  p_source_sequence bigint,
  p_target_member text,
  p_target_repository text,
  p_target_branch text,
  p_target_head_sha char(40),
  p_nonce uuid,
  p_reply_to_message_id uuid,
  p_predecessor_proof_cookie text,
  p_successor_proof_cookie text,
  p_payload_sha256 char(64),
  p_evidence_digest char(64),
  p_accepted_key_state jsonb,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_envelope jsonb,
  p_receipt jsonb,
  p_supersedes_message_ids uuid[]
)
returns table (
  outcome text,
  stored_receipt jsonb,
  current_state text,
  superseded_by_message_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  source_cursor public.federated_relay_source_cursors%rowtype;
  chain_cursor public.federated_relay_chain_cursors%rowtype;
  existing_record public.federated_relay_messages%rowtype;
  parent_record public.federated_relay_messages%rowtype;
  prior_record public.federated_relay_messages%rowtype;
  superseded_id uuid;
begin
  /*
    LOCK ORDER INVARIANT. NEVER REVERSE:
      1. public.federated_relay_source_cursors
      2. public.federated_relay_chain_cursors
      3. parent/superseded public.federated_relay_messages rows
      4. public.federated_relay_supersessions insert
  */

  if p_contract <> 'juss/federated-agent-relay@v3.1' then
    raise exception 'relay_contract';
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
  if p_relation_type not in ('root', 'reply', 'revision', 'reconcile') then
    raise exception 'relay_relation_type';
  end if;

  -- Friendly sequential duplicate path. The second lookup after cursor locking
  -- is the concurrency-safe duplicate path.
  select m.* into existing_record
    from public.federated_relay_messages as m
   where m.message_id = p_message_id;
  if found then
    if existing_record.semantic_fingerprint = p_semantic_fingerprint
      and existing_record.delivery_fingerprint = p_delivery_fingerprint then
      return query select
        'duplicate'::text,
        existing_record.receipt,
        existing_record.status,
        existing_record.superseded_by_message_id;
      return;
    end if;
    raise exception 'relay_message_id_collision';
  end if;

  -- 1. Source cursor shell + lock.
  insert into public.federated_relay_source_cursors (
    source_member, source_key_id, last_sequence, last_message_id
  ) values (
    p_source_member, p_source_key_id, -1, null
  ) on conflict (source_member, source_key_id) do nothing;

  select c.* into source_cursor
    from public.federated_relay_source_cursors as c
   where c.source_member = p_source_member
     and c.source_key_id = p_source_key_id
   for update;

  -- 2. Chain cursor shell + lock.
  insert into public.federated_relay_chain_cursors (
    chain_id, last_position, last_message_id, last_successor_cookie
  ) values (
    p_chain_id, -1, null, 'Q4R:v3.1:genesis'
  ) on conflict (chain_id) do nothing;

  select c.* into chain_cursor
    from public.federated_relay_chain_cursors as c
   where c.chain_id = p_chain_id
   for update;

  -- A concurrent exact duplicate may have committed while cursor creation/locks waited.
  select m.* into existing_record
    from public.federated_relay_messages as m
   where m.message_id = p_message_id;
  if found then
    if existing_record.semantic_fingerprint = p_semantic_fingerprint
      and existing_record.delivery_fingerprint = p_delivery_fingerprint then
      return query select
        'duplicate'::text,
        existing_record.receipt,
        existing_record.status,
        existing_record.superseded_by_message_id;
      return;
    end if;
    raise exception 'relay_message_id_collision';
  end if;

  if p_source_sequence <> source_cursor.last_sequence + 1 then
    raise exception 'relay_source_sequence_not_next';
  end if;

  if p_chain_position <> chain_cursor.last_position + 1 then
    raise exception 'relay_chain_position_not_next';
  end if;

  if chain_cursor.last_position = -1 then
    if p_relation_type <> 'root'
      or p_chain_position <> 0
      or p_parent_message_id is not null
      or p_reply_to_message_id is not null
      or p_predecessor_proof_cookie <> 'Q4R:v3.1:genesis' then
      raise exception 'relay_root_invalid';
    end if;
  else
    if p_relation_type = 'root' then
      raise exception 'relay_second_root';
    end if;
    if p_parent_message_id is null
      or p_parent_message_id <> chain_cursor.last_message_id then
      raise exception 'relay_parent_not_current_tip';
    end if;
    if p_predecessor_proof_cookie <> chain_cursor.last_successor_cookie then
      raise exception 'relay_chain_cookie_mismatch';
    end if;

    -- 3. Lock current parent row after cursors.
    select m.* into parent_record
      from public.federated_relay_messages as m
     where m.message_id = p_parent_message_id
     for update;
    if not found then
      raise exception 'relay_parent_missing';
    end if;
    if parent_record.status <> 'accepted' then
      raise exception 'relay_parent_inactive';
    end if;
    if parent_record.chain_id <> p_chain_id
      or parent_record.chain_position <> chain_cursor.last_position then
      raise exception 'relay_parent_chain_mismatch';
    end if;
    if parent_record.logical_operation_id <> p_logical_operation_id then
      raise exception 'relay_parent_operation_mismatch';
    end if;

    if p_relation_type = 'reply' then
      if p_reply_to_message_id <> p_parent_message_id then
        raise exception 'relay_reply_parent_mismatch';
      end if;
      if p_source_member <> parent_record.target_member
        or p_source_repository <> parent_record.target_repository
        or p_source_branch <> parent_record.target_branch
        or p_target_member <> parent_record.source_member
        or p_target_repository <> parent_record.source_repository
        or p_target_branch <> parent_record.source_branch then
        raise exception 'relay_reply_identity_not_inverted';
      end if;
    elsif p_reply_to_message_id is not null then
      raise exception 'relay_nonreply_reply_to_forbidden';
    end if;
  end if;

  if p_relation_type = 'revision' then
    if coalesce(array_length(p_supersedes_message_ids, 1), 0) = 0 then
      raise exception 'relay_revision_without_supersession';
    end if;
  elsif coalesce(array_length(p_supersedes_message_ids, 1), 0) > 0 then
    raise exception 'relay_supersession_requires_revision';
  end if;

  -- Lock every message whose live state the revision intends to retire.
  foreach superseded_id in array coalesce(p_supersedes_message_ids, '{}'::uuid[])
  loop
    if superseded_id = p_message_id then
      raise exception 'relay_self_supersession';
    end if;

    select m.* into prior_record
      from public.federated_relay_messages as m
     where m.message_id = superseded_id
     for update;

    if not found then
      raise exception 'relay_supersession_missing';
    end if;
    if prior_record.status <> 'accepted' then
      raise exception 'relay_supersession_inactive';
    end if;
    if prior_record.chain_id <> p_chain_id then
      raise exception 'relay_cross_chain_supersession';
    end if;
    if prior_record.logical_operation_id <> p_logical_operation_id then
      raise exception 'relay_cross_operation_supersession';
    end if;
    if prior_record.source_member <> p_source_member then
      raise exception 'relay_foreign_supersession';
    end if;
    if prior_record.chain_position >= p_chain_position then
      raise exception 'relay_reverse_supersession';
    end if;
  end loop;

  begin
    insert into public.federated_relay_messages (
      contract,
      message_id,
      semantic_fingerprint,
      delivery_fingerprint,
      receipt_id,
      chain_id,
      chain_position,
      relation_type,
      parent_message_id,
      logical_operation_id,
      source_member,
      source_repository,
      source_branch,
      source_head_sha,
      source_key_id,
      source_sequence,
      target_member,
      target_repository,
      target_branch,
      target_head_sha,
      nonce,
      reply_to_message_id,
      predecessor_proof_cookie,
      successor_proof_cookie,
      payload_sha256,
      evidence_digest,
      accepted_key_state,
      status,
      issued_at,
      expires_at,
      envelope,
      receipt
    ) values (
      p_contract,
      p_message_id,
      p_semantic_fingerprint,
      p_delivery_fingerprint,
      p_receipt_id,
      p_chain_id,
      p_chain_position,
      p_relation_type,
      p_parent_message_id,
      p_logical_operation_id,
      p_source_member,
      p_source_repository,
      p_source_branch,
      lower(p_source_head_sha),
      p_source_key_id,
      p_source_sequence,
      p_target_member,
      p_target_repository,
      p_target_branch,
      lower(p_target_head_sha),
      p_nonce,
      p_reply_to_message_id,
      p_predecessor_proof_cookie,
      p_successor_proof_cookie,
      p_payload_sha256,
      p_evidence_digest,
      p_accepted_key_state,
      'accepted',
      p_issued_at,
      p_expires_at,
      p_envelope,
      p_receipt
    );
  exception
    when unique_violation then
      select m.* into existing_record
        from public.federated_relay_messages as m
       where m.message_id = p_message_id;
      if found then
        if existing_record.semantic_fingerprint = p_semantic_fingerprint
          and existing_record.delivery_fingerprint = p_delivery_fingerprint then
          return query select
            'duplicate'::text,
            existing_record.receipt,
            existing_record.status,
            existing_record.superseded_by_message_id;
          return;
        end if;
        raise exception 'relay_message_id_collision';
      end if;

      if exists (
        select 1 from public.federated_relay_messages as m
         where m.source_member = p_source_member
           and m.source_key_id = p_source_key_id
           and m.nonce = p_nonce
      ) then
        raise exception 'relay_nonce_reuse';
      end if;
      if exists (
        select 1 from public.federated_relay_messages as m
         where m.source_member = p_source_member
           and m.source_key_id = p_source_key_id
           and m.source_sequence = p_source_sequence
      ) then
        raise exception 'relay_source_sequence_reuse';
      end if;
      if exists (
        select 1 from public.federated_relay_messages as m
         where m.chain_id = p_chain_id
           and m.chain_position = p_chain_position
      ) then
        raise exception 'relay_chain_position_reuse';
      end if;
      if exists (
        select 1 from public.federated_relay_messages as m
         where m.receipt_id = p_receipt_id
      ) then
        raise exception 'relay_receipt_id_collision';
      end if;
      raise;
  end;

  -- 4. Supersession edges are inserted after parent/message locks and before cursor advance.
  foreach superseded_id in array coalesce(p_supersedes_message_ids, '{}'::uuid[])
  loop
    begin
      insert into public.federated_relay_supersessions (
        predecessor_message_id,
        successor_message_id,
        chain_id,
        logical_operation_id
      ) values (
        superseded_id,
        p_message_id,
        p_chain_id,
        p_logical_operation_id
      );
    exception
      when unique_violation then
        raise exception 'relay_supersession_fork';
    end;

    update public.federated_relay_messages as m
       set status = 'superseded',
           superseded_at = now(),
           superseded_by_message_id = p_message_id
     where m.message_id = superseded_id
       and m.status = 'accepted';
    if not found then
      raise exception 'relay_supersession_race';
    end if;
  end loop;

  update public.federated_relay_source_cursors as c
     set last_sequence = p_source_sequence,
         last_message_id = p_message_id,
         updated_at = now()
   where c.source_member = p_source_member
     and c.source_key_id = p_source_key_id;

  update public.federated_relay_chain_cursors as c
     set last_position = p_chain_position,
         last_message_id = p_message_id,
         last_successor_cookie = p_successor_proof_cookie,
         updated_at = now()
   where c.chain_id = p_chain_id;

  return query select
    'accepted'::text,
    p_receipt,
    'accepted'::text,
    null::uuid;
end;
$function$;

revoke all on function public.federated_relay_accept_v31(
  text, uuid, char(64), char(64), uuid, uuid, bigint, text, uuid, uuid,
  text, text, text, char(40), text, bigint, text, text, text, char(40), uuid,
  uuid, text, text, char(64), char(64), jsonb, timestamptz, timestamptz, jsonb,
  jsonb, uuid[]
) from public;
revoke all on function public.federated_relay_accept_v31(
  text, uuid, char(64), char(64), uuid, uuid, bigint, text, uuid, uuid,
  text, text, text, char(40), text, bigint, text, text, text, char(40), uuid,
  uuid, text, text, char(64), char(64), jsonb, timestamptz, timestamptz, jsonb,
  jsonb, uuid[]
) from anon;
revoke all on function public.federated_relay_accept_v31(
  text, uuid, char(64), char(64), uuid, uuid, bigint, text, uuid, uuid,
  text, text, text, char(40), text, bigint, text, text, text, char(40), uuid,
  uuid, text, text, char(64), char(64), jsonb, timestamptz, timestamptz, jsonb,
  jsonb, uuid[]
) from authenticated;
grant execute on function public.federated_relay_accept_v31(
  text, uuid, char(64), char(64), uuid, uuid, bigint, text, uuid, uuid,
  text, text, text, char(40), text, bigint, text, text, text, char(40), uuid,
  uuid, text, text, char(64), char(64), jsonb, timestamptz, timestamptz, jsonb,
  jsonb, uuid[]
) to service_role;

comment on function public.federated_relay_accept_v31(
  text, uuid, char(64), char(64), uuid, uuid, bigint, text, uuid, uuid,
  text, text, text, char(40), text, bigint, text, text, text, char(40), uuid,
  uuid, text, text, char(64), char(64), jsonb, timestamptz, timestamptz, jsonb,
  jsonb, uuid[]
) is
  'Atomically persists one authenticated federated relay v3.1 acceptance. Locks source cursor before chain cursor, extends only the current chain tip, returns immutable stored receipts for exact duplicates, and never creates execution authority.';
