/*
  FEDERATED RELAY V3.1 INVARIANTS

  1. v1/v2/v3 chains are never continued by v3.1.
  2. One message ID has one immutable, receiver-signed receipt.
  3. Exact signed retries return the original receipt plus current mutable state.
  4. Lock order is always source cursor -> chain cursor -> parent/message rows.
  5. Every non-root message extends the current chain tip.
  6. A root uses Q4R:v3.1:genesis only.
  7. Successor cookies are chain-scoped and bind predecessor cookie, delivery fingerprint,
     nonce, source member, and target member.
  8. Supersession mutates only live status/edge fields; signed acceptance history is immutable.
  9. Payload content is inert data and cannot transfer authority.
 10. Any failure rolls back message, receipt, cursors, supersession, and state changes together.
 11. Sender sequence allocation is durable before signing; retry reuses the same signed envelope.
 12. v3.1 is additive. Existing v3 tables/functions remain untouched for dual-stack compatibility.
*/

create table if not exists public.federated_relay_v31_public_keys (
  member text not null,
  key_id text not null,
  algorithm text not null default 'Ed25519',
  public_key_jwk jsonb not null,
  state text not null default 'active',
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (member, key_id),
  constraint federated_relay_v31_key_member check (member in ('founder-control-room','chief-ai-machine','solcontinuity','promptos')),
  constraint federated_relay_v31_key_algorithm check (algorithm = 'Ed25519'),
  constraint federated_relay_v31_key_state check (state in ('active','retiring','revoked')),
  constraint federated_relay_v31_key_window check (valid_until is null or valid_until > valid_from),
  constraint federated_relay_v31_key_revocation check ((state = 'revoked') = (revoked_at is not null))
);

create table if not exists public.federated_relay_v31_source_cursors (
  source_member text not null,
  source_key_id text not null,
  target_member text not null,
  last_sequence bigint not null default -1,
  last_message_id uuid,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (source_member, source_key_id, target_member),
  foreign key (source_member, source_key_id)
    references public.federated_relay_v31_public_keys(member, key_id) on delete restrict,
  constraint federated_relay_v31_source_cursor_nonnegative check (last_sequence >= -1)
);

create table if not exists public.federated_relay_v31_outbound_cursors (
  source_member text not null,
  source_key_id text not null,
  target_member text not null,
  last_resolved_sequence bigint not null default -1,
  pending_sequence bigint,
  pending_message_id uuid,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (source_member, source_key_id, target_member),
  foreign key (source_member, source_key_id)
    references public.federated_relay_v31_public_keys(member, key_id) on delete restrict,
  constraint federated_relay_v31_outbound_cursor_nonnegative check (last_resolved_sequence >= -1),
  constraint federated_relay_v31_outbound_pending_pair check ((pending_sequence is null) = (pending_message_id is null))
);

create table if not exists public.federated_relay_v31_chain_cursors (
  chain_id uuid primary key,
  logical_operation_id uuid not null,
  member_a text not null,
  repository_a text not null,
  member_b text not null,
  repository_b text not null,
  last_position bigint not null default -1,
  last_message_id uuid,
  last_successor_cookie text not null default 'Q4R:v3.1:genesis',
  last_origin text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint federated_relay_v31_chain_members check (
    member_a in ('founder-control-room','chief-ai-machine','solcontinuity','promptos')
    and member_b in ('founder-control-room','chief-ai-machine','solcontinuity','promptos')
    and member_a <> member_b
  ),
  constraint federated_relay_v31_chain_position check (last_position >= -1),
  constraint federated_relay_v31_chain_origin check (last_origin is null or last_origin in ('inbound','outbound')),
  constraint federated_relay_v31_chain_tip_pair check ((last_message_id is null) = (last_position = -1))
);

create table if not exists public.federated_relay_v31_outbox (
  message_id uuid primary key,
  source_member text not null,
  source_repository text not null,
  source_branch text not null,
  source_head_sha text not null,
  source_key_id text not null,
  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  target_head_sha text not null,
  source_sequence bigint not null,
  chain_id uuid not null,
  chain_position bigint not null,
  logical_operation_id uuid not null,
  relation_type text not null,
  parent_message_id uuid,
  predecessor_proof_cookie text not null,
  semantic_fingerprint text,
  delivery_fingerprint text,
  successor_proof_cookie text,
  envelope jsonb,
  delivery_status text not null default 'draft',
  receipt jsonb,
  remote_current_state text,
  remote_superseded_by_message_id uuid,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  signed_at timestamptz,
  sent_at timestamptz,
  resolved_at timestamptz,
  unique (source_member, source_key_id, target_member, source_sequence),
  unique (chain_id, chain_position),
  foreign key (source_member, source_key_id)
    references public.federated_relay_v31_public_keys(member, key_id) on delete restrict,
  constraint federated_relay_v31_outbox_sha check (source_head_sha ~ '^[0-9a-f]{40}$' and target_head_sha ~ '^[0-9a-f]{40}$'),
  constraint federated_relay_v31_outbox_sequence check (source_sequence >= 0 and chain_position >= 0),
  constraint federated_relay_v31_outbox_relation check (relation_type in ('root','reply','revision','reconcile')),
  constraint federated_relay_v31_outbox_status check (delivery_status in ('draft','signed','sent','accepted','duplicate','failed')),
  constraint federated_relay_v31_outbox_remote_state check (remote_current_state is null or remote_current_state in ('accepted','superseded','revoked'))
);

create table if not exists public.federated_relay_v31_messages (
  message_id uuid primary key,
  contract text not null,
  semantic_fingerprint char(64) not null,
  delivery_fingerprint char(64) not null,
  receipt_id uuid not null unique,
  receipt jsonb not null,
  envelope jsonb not null,
  chain_id uuid not null,
  chain_position bigint not null,
  logical_operation_id uuid not null,
  relation_type text not null,
  parent_message_id uuid,
  reply_to_message_id uuid,
  source_member text not null,
  source_repository text not null,
  source_branch text not null,
  source_head_sha char(40) not null,
  source_key_id text not null,
  source_sequence bigint not null,
  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  target_head_sha char(40) not null,
  nonce uuid not null,
  predecessor_proof_cookie text not null,
  successor_proof_cookie text not null,
  payload_sha256 char(64) not null,
  evidence_digest char(64) not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'accepted',
  superseded_by_message_id uuid,
  accepted_at timestamptz not null,
  unique (source_member, source_key_id, target_member, source_sequence),
  unique (source_member, source_key_id, nonce),
  unique (chain_id, chain_position),
  foreign key (source_member, source_key_id)
    references public.federated_relay_v31_public_keys(member, key_id) on delete restrict,
  constraint federated_relay_v31_messages_contract check (contract = 'juss/federated-agent-relay@v3.1'),
  constraint federated_relay_v31_messages_relation check (relation_type in ('root','reply','revision','reconcile')),
  constraint federated_relay_v31_messages_status check (status in ('accepted','superseded','revoked')),
  constraint federated_relay_v31_messages_sequence check (source_sequence >= 0 and chain_position >= 0),
  constraint federated_relay_v31_messages_sha check (
    source_head_sha ~ '^[0-9a-f]{40}$' and target_head_sha ~ '^[0-9a-f]{40}$'
    and semantic_fingerprint ~ '^[0-9a-f]{64}$' and delivery_fingerprint ~ '^[0-9a-f]{64}$'
    and payload_sha256 ~ '^[0-9a-f]{64}$' and evidence_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint federated_relay_v31_messages_time check (expires_at > issued_at)
);

create index if not exists federated_relay_v31_messages_parent_idx on public.federated_relay_v31_messages(parent_message_id) where parent_message_id is not null;
create index if not exists federated_relay_v31_messages_logical_idx on public.federated_relay_v31_messages(logical_operation_id, accepted_at);
create index if not exists federated_relay_v31_outbox_parent_idx on public.federated_relay_v31_outbox(parent_message_id) where parent_message_id is not null;

alter table public.federated_relay_v31_public_keys enable row level security;
alter table public.federated_relay_v31_source_cursors enable row level security;
alter table public.federated_relay_v31_outbound_cursors enable row level security;
alter table public.federated_relay_v31_chain_cursors enable row level security;
alter table public.federated_relay_v31_outbox enable row level security;
alter table public.federated_relay_v31_messages enable row level security;

revoke all on public.federated_relay_v31_public_keys from public, anon, authenticated, service_role;
revoke all on public.federated_relay_v31_source_cursors from public, anon, authenticated, service_role;
revoke all on public.federated_relay_v31_outbound_cursors from public, anon, authenticated, service_role;
revoke all on public.federated_relay_v31_chain_cursors from public, anon, authenticated, service_role;
revoke all on public.federated_relay_v31_outbox from public, anon, authenticated, service_role;
revoke all on public.federated_relay_v31_messages from public, anon, authenticated, service_role;
grant select on public.federated_relay_v31_public_keys, public.federated_relay_v31_outbox, public.federated_relay_v31_messages to service_role;

create or replace function public.federated_relay_v31_key_immutability()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.member <> old.member or new.key_id <> old.key_id or new.algorithm <> old.algorithm
     or new.public_key_jwk <> old.public_key_jwk or new.valid_from <> old.valid_from then
    raise exception 'relay_key_identity_immutable';
  end if;
  if old.state = 'revoked' then raise exception 'relay_key_revocation_final'; end if;
  if old.state = 'retiring' and new.state = 'active' then raise exception 'relay_key_state_regression'; end if;
  if new.valid_until is not null and old.valid_until is not null and new.valid_until > old.valid_until then
    raise exception 'relay_key_validity_extension_rejected';
  end if;
  if new.state = 'revoked' and new.revoked_at is null then new.revoked_at := clock_timestamp(); end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists federated_relay_v31_key_immutability on public.federated_relay_v31_public_keys;
create trigger federated_relay_v31_key_immutability
before update on public.federated_relay_v31_public_keys
for each row execute function public.federated_relay_v31_key_immutability();

create or replace function public.federated_relay_v31_message_immutability()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if to_jsonb(new) - array['status','superseded_by_message_id'] <> to_jsonb(old) - array['status','superseded_by_message_id'] then
    raise exception 'relay_acceptance_history_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists federated_relay_v31_message_immutability on public.federated_relay_v31_messages;
create trigger federated_relay_v31_message_immutability
before update on public.federated_relay_v31_messages
for each row execute function public.federated_relay_v31_message_immutability();

create or replace function public.federated_relay_v31_register_ephemeral_key(
  p_member text, p_key_id text, p_public_key_jwk jsonb, p_valid_from timestamptz, p_valid_until timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_member not in ('founder-control-room','chief-ai-machine','solcontinuity','promptos') then raise exception 'relay_member_invalid'; end if;
  if p_key_id !~ '^[A-Za-z0-9._:-]{3,200}$' then raise exception 'relay_key_id_invalid'; end if;
  if p_key_id not like p_member || ':relay-v3.1:ci:%' then raise exception 'relay_ephemeral_key_namespace_invalid'; end if;
  if p_valid_from < clock_timestamp() - interval '2 minutes' or p_valid_until > clock_timestamp() + interval '20 minutes'
     or p_valid_until <= p_valid_from then raise exception 'relay_ephemeral_key_window_invalid'; end if;
  insert into public.federated_relay_v31_public_keys(member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until)
  values (p_member,p_key_id,'Ed25519',p_public_key_jwk,'active',p_valid_from,p_valid_until);
end;
$$;

create or replace function public.federated_relay_v31_reserve_outbound(
  p_message_id uuid, p_source_member text, p_source_repository text, p_source_branch text, p_source_head_sha text,
  p_source_key_id text, p_target_member text, p_target_repository text, p_target_branch text, p_target_head_sha text,
  p_chain_id uuid, p_chain_position bigint, p_logical_operation_id uuid, p_relation_type text,
  p_parent_message_id uuid, p_predecessor_proof_cookie text
) returns table(source_sequence bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_source public.federated_relay_v31_outbound_cursors%rowtype;
  v_chain public.federated_relay_v31_chain_cursors%rowtype;
  v_existing public.federated_relay_v31_outbox%rowtype;
  v_sequence bigint;
begin
  select * into v_existing from public.federated_relay_v31_outbox where message_id = p_message_id;
  if found then return query select v_existing.source_sequence; return; end if;
  if p_source_member = p_target_member then raise exception 'relay_same_member_rejected'; end if;
  if p_source_repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' or p_target_repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then raise exception 'relay_repository_invalid'; end if;
  if p_source_head_sha !~ '^[0-9a-f]{40}$' or p_target_head_sha !~ '^[0-9a-f]{40}$' then raise exception 'relay_head_invalid'; end if;
  if p_relation_type not in ('root','reply','revision','reconcile') then raise exception 'relay_relation_invalid'; end if;
  if not exists (
    select 1 from public.federated_relay_v31_public_keys k
    where k.member=p_source_member and k.key_id=p_source_key_id and k.state in ('active','retiring') and k.revoked_at is null
      and k.valid_from <= clock_timestamp() and (k.valid_until is null or k.valid_until >= clock_timestamp())
  ) then raise exception 'relay_signing_key_not_current'; end if;

  insert into public.federated_relay_v31_outbound_cursors(source_member,source_key_id,target_member)
  values (p_source_member,p_source_key_id,p_target_member) on conflict do nothing;
  select * into v_source from public.federated_relay_v31_outbound_cursors
   where source_member=p_source_member and source_key_id=p_source_key_id and target_member=p_target_member for update;
  if v_source.pending_message_id is not null then raise exception 'relay_outbound_pending'; end if;
  v_sequence := v_source.last_resolved_sequence + 1;

  if p_relation_type = 'root' then
    if p_chain_position <> 0 or p_parent_message_id is not null or p_predecessor_proof_cookie <> 'Q4R:v3.1:genesis' then raise exception 'relay_root_invalid'; end if;
    insert into public.federated_relay_v31_chain_cursors(
      chain_id,logical_operation_id,member_a,repository_a,member_b,repository_b,last_position,last_successor_cookie
    ) values (p_chain_id,p_logical_operation_id,p_source_member,p_source_repository,p_target_member,p_target_repository,-1,'Q4R:v3.1:genesis')
    on conflict do nothing;
  end if;

  select * into v_chain from public.federated_relay_v31_chain_cursors where chain_id=p_chain_id for update;
  if not found then raise exception 'relay_chain_unknown'; end if;
  if v_chain.logical_operation_id <> p_logical_operation_id then raise exception 'relay_logical_operation_mismatch'; end if;
  if not ((v_chain.member_a=p_source_member and v_chain.member_b=p_target_member) or (v_chain.member_a=p_target_member and v_chain.member_b=p_source_member)) then raise exception 'relay_chain_participant_mismatch'; end if;
  if p_chain_position <> v_chain.last_position + 1 then raise exception 'relay_chain_position_not_next'; end if;
  if p_chain_position > 0 and p_parent_message_id is distinct from v_chain.last_message_id then raise exception 'relay_parent_not_tip'; end if;
  if p_predecessor_proof_cookie <> v_chain.last_successor_cookie then raise exception 'relay_chain_cookie_mismatch'; end if;

  insert into public.federated_relay_v31_outbox(
    message_id,source_member,source_repository,source_branch,source_head_sha,source_key_id,
    target_member,target_repository,target_branch,target_head_sha,source_sequence,chain_id,chain_position,
    logical_operation_id,relation_type,parent_message_id,predecessor_proof_cookie
  ) values (
    p_message_id,p_source_member,p_source_repository,p_source_branch,p_source_head_sha,p_source_key_id,
    p_target_member,p_target_repository,p_target_branch,p_target_head_sha,v_sequence,p_chain_id,p_chain_position,
    p_logical_operation_id,p_relation_type,p_parent_message_id,p_predecessor_proof_cookie
  );
  update public.federated_relay_v31_outbound_cursors set pending_sequence=v_sequence,pending_message_id=p_message_id,updated_at=clock_timestamp()
   where source_member=p_source_member and source_key_id=p_source_key_id and target_member=p_target_member;
  return query select v_sequence;
end;
$$;

create or replace function public.federated_relay_v31_finalize_outbound(
  p_message_id uuid, p_semantic_fingerprint text, p_delivery_fingerprint text,
  p_successor_proof_cookie text, p_envelope jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_outbox public.federated_relay_v31_outbox%rowtype;
  v_source public.federated_relay_v31_outbound_cursors%rowtype;
  v_chain public.federated_relay_v31_chain_cursors%rowtype;
begin
  select * into v_outbox from public.federated_relay_v31_outbox where message_id=p_message_id;
  if not found then raise exception 'relay_outbox_missing'; end if;
  select * into v_source from public.federated_relay_v31_outbound_cursors
    where source_member=v_outbox.source_member and source_key_id=v_outbox.source_key_id and target_member=v_outbox.target_member for update;
  select * into v_chain from public.federated_relay_v31_chain_cursors where chain_id=v_outbox.chain_id for update;
  select * into v_outbox from public.federated_relay_v31_outbox where message_id=p_message_id for update;
  if v_outbox.delivery_status <> 'draft' then
    if v_outbox.delivery_fingerprint=p_delivery_fingerprint then return; end if;
    raise exception 'relay_outbox_finalization_collision';
  end if;
  if v_source.pending_message_id is distinct from p_message_id or v_source.pending_sequence is distinct from v_outbox.source_sequence then raise exception 'relay_outbound_cursor_mismatch'; end if;
  if v_chain.last_position + 1 <> v_outbox.chain_position or v_chain.last_successor_cookie <> v_outbox.predecessor_proof_cookie then raise exception 'relay_chain_tip_moved'; end if;
  if p_semantic_fingerprint !~ '^[0-9a-f]{64}$' or p_delivery_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'relay_fingerprint_invalid'; end if;
  if p_envelope->>'messageId' <> p_message_id::text or p_envelope->'ordering'->>'sourceSequence' <> v_outbox.source_sequence::text then raise exception 'relay_outbox_envelope_binding_invalid'; end if;
  update public.federated_relay_v31_outbox set
    semantic_fingerprint=p_semantic_fingerprint,delivery_fingerprint=p_delivery_fingerprint,
    successor_proof_cookie=p_successor_proof_cookie,envelope=p_envelope,delivery_status='signed',signed_at=clock_timestamp()
  where message_id=p_message_id;
  update public.federated_relay_v31_chain_cursors set
    last_position=v_outbox.chain_position,last_message_id=p_message_id,last_successor_cookie=p_successor_proof_cookie,
    last_origin='outbound',updated_at=clock_timestamp()
  where chain_id=v_outbox.chain_id;
end;
$$;

create or replace function public.federated_relay_v31_resolve_outbound(
  p_message_id uuid, p_delivery text, p_receipt jsonb, p_current_state text, p_superseded_by_message_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_outbox public.federated_relay_v31_outbox%rowtype;
  v_source public.federated_relay_v31_outbound_cursors%rowtype;
begin
  select * into v_outbox from public.federated_relay_v31_outbox where message_id=p_message_id;
  if not found then raise exception 'relay_outbox_missing'; end if;
  select * into v_source from public.federated_relay_v31_outbound_cursors
    where source_member=v_outbox.source_member and source_key_id=v_outbox.source_key_id and target_member=v_outbox.target_member for update;
  select * into v_outbox from public.federated_relay_v31_outbox where message_id=p_message_id for update;
  if p_delivery not in ('accepted','duplicate') or p_current_state not in ('accepted','superseded','revoked') then raise exception 'relay_delivery_result_invalid'; end if;
  if p_receipt->>'contract' <> 'juss/federated-agent-relay-receipt@v3.1' or p_receipt->>'messageId' <> p_message_id::text then raise exception 'relay_receipt_binding_invalid'; end if;
  if v_outbox.delivery_status in ('accepted','duplicate') then return; end if;
  if v_source.pending_message_id is distinct from p_message_id then raise exception 'relay_outbound_cursor_mismatch'; end if;
  update public.federated_relay_v31_outbox set delivery_status=p_delivery,receipt=p_receipt,remote_current_state=p_current_state,
    remote_superseded_by_message_id=p_superseded_by_message_id,resolved_at=clock_timestamp()
   where message_id=p_message_id;
  update public.federated_relay_v31_outbound_cursors set last_resolved_sequence=v_outbox.source_sequence,
    pending_sequence=null,pending_message_id=null,updated_at=clock_timestamp()
   where source_member=v_outbox.source_member and source_key_id=v_outbox.source_key_id and target_member=v_outbox.target_member;
end;
$$;

create or replace function public.federated_relay_accept_v31(
  p_message_id uuid, p_semantic_fingerprint text, p_delivery_fingerprint text, p_receipt_id uuid, p_receipt jsonb,
  p_envelope jsonb, p_chain_id uuid, p_chain_position bigint, p_logical_operation_id uuid,
  p_relation_type text, p_parent_message_id uuid, p_reply_to_message_id uuid,
  p_source_member text, p_source_repository text, p_source_branch text, p_source_head_sha text, p_source_key_id text, p_source_sequence bigint,
  p_target_member text, p_target_repository text, p_target_branch text, p_target_head_sha text,
  p_nonce uuid, p_predecessor_proof_cookie text, p_successor_proof_cookie text,
  p_payload_sha256 text, p_evidence_digest text, p_issued_at timestamptz, p_expires_at timestamptz,
  p_supersedes_message_ids uuid[]
) returns table(delivery text, stored_receipt jsonb, current_state text, superseded_by_message_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.federated_relay_v31_messages%rowtype;
  v_source public.federated_relay_v31_source_cursors%rowtype;
  v_chain public.federated_relay_v31_chain_cursors%rowtype;
  v_parent_in public.federated_relay_v31_messages%rowtype;
  v_parent_out public.federated_relay_v31_outbox%rowtype;
  v_now timestamptz;
begin
  select * into v_existing from public.federated_relay_v31_messages where message_id=p_message_id;
  if found then
    if v_existing.semantic_fingerprint <> p_semantic_fingerprint or v_existing.delivery_fingerprint <> p_delivery_fingerprint then raise exception 'relay_message_id_collision'; end if;
    return query select 'duplicate'::text,v_existing.receipt,v_existing.status,v_existing.superseded_by_message_id;
    return;
  end if;
  if p_source_member=p_target_member then raise exception 'relay_same_member_rejected'; end if;
  if p_source_head_sha !~ '^[0-9a-f]{40}$' or p_target_head_sha !~ '^[0-9a-f]{40}$'
     or p_semantic_fingerprint !~ '^[0-9a-f]{64}$' or p_delivery_fingerprint !~ '^[0-9a-f]{64}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' or p_evidence_digest !~ '^[0-9a-f]{64}$' then raise exception 'relay_identity_or_digest_invalid'; end if;
  if p_relation_type not in ('root','reply','revision','reconcile') then raise exception 'relay_relation_invalid'; end if;
  if p_receipt->>'contract' <> 'juss/federated-agent-relay-receipt@v3.1' or p_receipt->>'receiptId' <> p_receipt_id::text
     or p_receipt->>'messageId' <> p_message_id::text or p_receipt->>'deliveryFingerprint' <> p_delivery_fingerprint
     or p_receipt->>'successorProofCookie' <> p_successor_proof_cookie then raise exception 'relay_receipt_binding_invalid'; end if;
  if not (p_receipt @> '{"executionAuthorized":false,"authorityTransferred":false,"approvalCarriedForward":false}'::jsonb) then raise exception 'relay_receipt_authority_invalid'; end if;
  if p_envelope->>'contract' <> 'juss/federated-agent-relay@v3.1' or p_envelope->>'messageId' <> p_message_id::text then raise exception 'relay_envelope_binding_invalid'; end if;

  insert into public.federated_relay_v31_source_cursors(source_member,source_key_id,target_member)
  values (p_source_member,p_source_key_id,p_target_member) on conflict do nothing;
  select * into v_source from public.federated_relay_v31_source_cursors
   where source_member=p_source_member and source_key_id=p_source_key_id and target_member=p_target_member for update;

  if p_relation_type='root' then
    insert into public.federated_relay_v31_chain_cursors(
      chain_id,logical_operation_id,member_a,repository_a,member_b,repository_b,last_position,last_successor_cookie
    ) values (p_chain_id,p_logical_operation_id,p_source_member,p_source_repository,p_target_member,p_target_repository,-1,'Q4R:v3.1:genesis')
    on conflict do nothing;
  end if;
  select * into v_chain from public.federated_relay_v31_chain_cursors where chain_id=p_chain_id for update;
  if not found then raise exception 'relay_chain_unknown'; end if;

  if p_source_sequence <> v_source.last_sequence + 1 then raise exception 'relay_source_sequence_not_next'; end if;
  if p_chain_position <> v_chain.last_position + 1 then raise exception 'relay_chain_position_not_next'; end if;
  if p_logical_operation_id <> v_chain.logical_operation_id then raise exception 'relay_logical_operation_mismatch'; end if;
  if not ((v_chain.member_a=p_source_member and v_chain.member_b=p_target_member) or (v_chain.member_a=p_target_member and v_chain.member_b=p_source_member)) then raise exception 'relay_chain_participant_mismatch'; end if;
  if p_predecessor_proof_cookie <> v_chain.last_successor_cookie then raise exception 'relay_chain_cookie_mismatch'; end if;

  if p_relation_type='root' then
    if p_chain_position<>0 or p_parent_message_id is not null or p_reply_to_message_id is not null or p_predecessor_proof_cookie<>'Q4R:v3.1:genesis' then raise exception 'relay_root_invalid'; end if;
  else
    if p_parent_message_id is null or p_parent_message_id is distinct from v_chain.last_message_id then raise exception 'relay_parent_not_tip'; end if;
    if v_chain.last_origin='inbound' then
      select * into v_parent_in from public.federated_relay_v31_messages where message_id=p_parent_message_id for update;
      if not found then raise exception 'relay_parent_missing'; end if;
      if p_relation_type='reply' and not (v_parent_in.source_member=p_target_member and v_parent_in.target_member=p_source_member and p_reply_to_message_id=p_parent_message_id) then raise exception 'relay_reply_direction_invalid'; end if;
      if p_relation_type='revision' and not (v_parent_in.source_member=p_source_member and v_parent_in.target_member=p_target_member and v_parent_in.status='accepted'
        and cardinality(coalesce(p_supersedes_message_ids,'{}'::uuid[]))=1 and p_supersedes_message_ids[1]=p_parent_message_id) then raise exception 'relay_revision_invalid'; end if;
    elsif v_chain.last_origin='outbound' then
      select * into v_parent_out from public.federated_relay_v31_outbox where message_id=p_parent_message_id for update;
      if not found or v_parent_out.delivery_status not in ('signed','sent','accepted','duplicate') then raise exception 'relay_parent_missing'; end if;
      if p_relation_type='reply' and not (v_parent_out.source_member=p_target_member and v_parent_out.target_member=p_source_member and p_reply_to_message_id=p_parent_message_id) then raise exception 'relay_reply_direction_invalid'; end if;
      if p_relation_type='revision' then raise exception 'relay_remote_revision_of_local_outbound_rejected'; end if;
    else raise exception 'relay_parent_origin_invalid'; end if;
    if p_relation_type<>'reply' and p_reply_to_message_id is not null then raise exception 'relay_nonreply_reply_to_rejected'; end if;
    if p_relation_type<>'revision' and cardinality(coalesce(p_supersedes_message_ids,'{}'::uuid[]))<>0 then raise exception 'relay_supersession_requires_revision'; end if;
  end if;

  v_now := clock_timestamp();
  if p_expires_at <= p_issued_at or p_expires_at < v_now then raise exception 'relay_expired'; end if;
  if not exists (
    select 1 from public.federated_relay_v31_public_keys k where k.member=p_source_member and k.key_id=p_source_key_id
      and k.state in ('active','retiring') and k.revoked_at is null and k.valid_from <= p_issued_at and k.valid_from <= v_now
      and (k.valid_until is null or (k.valid_until >= p_issued_at and k.valid_until >= v_now))
  ) then raise exception 'relay_signing_key_not_current'; end if;
  if exists (select 1 from public.federated_relay_v31_messages where source_member=p_source_member and source_key_id=p_source_key_id and nonce=p_nonce) then raise exception 'relay_nonce_collision'; end if;

  insert into public.federated_relay_v31_messages(
    message_id,contract,semantic_fingerprint,delivery_fingerprint,receipt_id,receipt,envelope,
    chain_id,chain_position,logical_operation_id,relation_type,parent_message_id,reply_to_message_id,
    source_member,source_repository,source_branch,source_head_sha,source_key_id,source_sequence,
    target_member,target_repository,target_branch,target_head_sha,nonce,predecessor_proof_cookie,successor_proof_cookie,
    payload_sha256,evidence_digest,issued_at,expires_at,accepted_at
  ) values (
    p_message_id,'juss/federated-agent-relay@v3.1',p_semantic_fingerprint,p_delivery_fingerprint,p_receipt_id,p_receipt,p_envelope,
    p_chain_id,p_chain_position,p_logical_operation_id,p_relation_type,p_parent_message_id,p_reply_to_message_id,
    p_source_member,p_source_repository,p_source_branch,p_source_head_sha,p_source_key_id,p_source_sequence,
    p_target_member,p_target_repository,p_target_branch,p_target_head_sha,p_nonce,p_predecessor_proof_cookie,p_successor_proof_cookie,
    p_payload_sha256,p_evidence_digest,p_issued_at,p_expires_at,v_now
  );

  if p_relation_type='revision' then
    update public.federated_relay_v31_messages set status='superseded',superseded_by_message_id=p_message_id
      where message_id=p_parent_message_id and status='accepted';
    if not found then raise exception 'relay_supersession_fork_rejected'; end if;
  end if;

  update public.federated_relay_v31_source_cursors set last_sequence=p_source_sequence,last_message_id=p_message_id,updated_at=v_now
   where source_member=p_source_member and source_key_id=p_source_key_id and target_member=p_target_member;
  update public.federated_relay_v31_chain_cursors set last_position=p_chain_position,last_message_id=p_message_id,
    last_successor_cookie=p_successor_proof_cookie,last_origin='inbound',updated_at=v_now where chain_id=p_chain_id;

  return query select 'accepted'::text,p_receipt,'accepted'::text,null::uuid;
exception
  when unique_violation then raise exception 'relay_concurrency_conflict';
end;
$$;

revoke all on function public.federated_relay_v31_register_ephemeral_key(text,text,jsonb,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.federated_relay_v31_reserve_outbound(uuid,text,text,text,text,text,text,text,text,text,uuid,bigint,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.federated_relay_v31_finalize_outbound(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.federated_relay_v31_resolve_outbound(uuid,text,jsonb,text,uuid) from public, anon, authenticated;
revoke all on function public.federated_relay_accept_v31(uuid,text,text,uuid,jsonb,jsonb,uuid,bigint,uuid,text,uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,uuid[]) from public, anon, authenticated;

grant execute on function public.federated_relay_v31_register_ephemeral_key(text,text,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.federated_relay_v31_reserve_outbound(uuid,text,text,text,text,text,text,text,text,text,uuid,bigint,uuid,text,uuid,text) to service_role;
grant execute on function public.federated_relay_v31_finalize_outbound(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.federated_relay_v31_resolve_outbound(uuid,text,jsonb,text,uuid) to service_role;
grant execute on function public.federated_relay_accept_v31(uuid,text,text,uuid,jsonb,jsonb,uuid,bigint,uuid,text,uuid,uuid,text,text,text,text,text,bigint,text,text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,uuid[]) to service_role;
