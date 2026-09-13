-- Federated relay v3.1 durable evidence ledger.
-- SOURCE ONLY: this migration is not proof that any production database was mutated.
-- Wire payloads carry evidence only and never transfer execution/approval authority.

create extension if not exists "pgcrypto";

create table if not exists public.federated_relay_source_cursors (
  source_member text not null,
  source_key_id text not null,
  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  last_sequence bigint not null default -1 check (last_sequence >= -1),
  last_message_id uuid,
  pending_message_id uuid,
  updated_at timestamptz not null default now(),
  primary key (source_member, source_key_id, target_member, target_repository, target_branch)
);

create table if not exists public.federated_relay_chain_cursors (
  chain_id uuid primary key,
  last_position bigint not null default -1 check (last_position >= -1),
  last_message_id uuid,
  last_successor_cookie text not null default 'Q4R:v3.1:genesis',
  last_logical_operation_id uuid,
  last_source_member text,
  last_source_repository text,
  last_source_branch text,
  last_target_member text,
  last_target_repository text,
  last_target_branch text,
  last_expires_at timestamptz,
  last_origin text check (last_origin is null or last_origin in ('inbound','outbound')),
  pending_outbound_message_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.federated_relay_public_keys (
  member text not null,
  key_id text not null,
  algorithm text not null check (algorithm = 'Ed25519'),
  public_key_jwk jsonb not null,
  state text not null check (state in ('active','retiring','revoked')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member, key_id),
  check (valid_until is null or valid_until > valid_from),
  check (state <> 'revoked' or revoked_at is not null)
);

-- parent_message_id/reply_to_message_id intentionally are NOT local foreign keys.
-- A parent can be an outbound message accepted into another sovereign member's
-- ledger. The authenticated local chain cursor is the authority for the current tip.
create table if not exists public.federated_relay_messages (
  id uuid primary key default gen_random_uuid(),
  contract text not null check (contract = 'juss/federated-agent-relay@v3.1'),
  message_id uuid not null unique,
  semantic_fingerprint char(64) not null,
  delivery_fingerprint char(64) not null,
  receipt_id uuid not null unique,
  chain_id uuid not null,
  chain_position bigint not null check (chain_position >= 0),
  relation_type text not null check (relation_type in ('root','reply','revision','reconcile')),
  parent_message_id uuid,
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
  reply_to_message_id uuid,
  predecessor_proof_cookie text not null,
  successor_proof_cookie text not null,
  payload_sha256 char(64) not null,
  evidence_digest char(64) not null,
  accepted_key_state jsonb not null,
  status text not null default 'accepted' check (status in ('accepted','superseded','revoked')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_message_id uuid,
  envelope jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at),
  unique (source_member, source_key_id, target_member, target_repository, target_branch, source_sequence),
  unique (source_member, source_key_id, nonce),
  unique (chain_id, chain_position),
  check (
    (relation_type='root' and chain_position=0 and parent_message_id is null and reply_to_message_id is null)
    or (relation_type<>'root' and chain_position>0 and parent_message_id is not null)
  ),
  check (
    (relation_type='reply' and reply_to_message_id=parent_message_id)
    or (relation_type<>'reply' and reply_to_message_id is null)
  )
);

create table if not exists public.federated_relay_supersessions (
  predecessor_message_id uuid primary key references public.federated_relay_messages(message_id) on delete restrict,
  successor_message_id uuid not null references public.federated_relay_messages(message_id) on delete restrict,
  chain_id uuid not null,
  logical_operation_id uuid not null,
  created_at timestamptz not null default now(),
  check (predecessor_message_id <> successor_message_id)
);

create table if not exists public.federated_relay_outbox (
  message_id uuid primary key,
  chain_id uuid not null,
  relation_type text not null check (relation_type in ('root','reply','revision','reconcile')),
  parent_message_id uuid,
  logical_operation_id uuid not null,
  source_member text not null,
  source_repository text not null,
  source_branch text not null,
  source_key_id text not null,
  source_sequence bigint not null check (source_sequence >= 0),
  target_member text not null,
  target_repository text not null,
  target_branch text not null,
  chain_position bigint not null check (chain_position >= 0),
  predecessor_proof_cookie text not null,
  expires_at timestamptz not null,
  semantic_fingerprint char(64),
  delivery_fingerprint char(64),
  envelope jsonb,
  delivery_status text not null check (delivery_status in ('draft','signed','sent','accepted','duplicate','failed')),
  receipt jsonb,
  receiver_current_state text check (receiver_current_state is null or receiver_current_state in ('accepted','superseded','revoked')),
  last_error text,
  created_at timestamptz not null default now(),
  signed_at timestamptz,
  sent_at timestamptz,
  resolved_at timestamptz,
  unique (source_member, source_key_id, target_member, target_repository, target_branch, source_sequence),
  unique (chain_id, chain_position)
);

create index if not exists federated_relay_messages_chain_idx on public.federated_relay_messages(chain_id,chain_position);
create index if not exists federated_relay_messages_operation_idx on public.federated_relay_messages(logical_operation_id,chain_id);
create index if not exists federated_relay_messages_status_idx on public.federated_relay_messages(status,accepted_at desc);
create index if not exists federated_relay_outbox_status_idx on public.federated_relay_outbox(delivery_status,created_at);

alter table public.federated_relay_source_cursors enable row level security;
alter table public.federated_relay_chain_cursors enable row level security;
alter table public.federated_relay_public_keys enable row level security;
alter table public.federated_relay_messages enable row level security;
alter table public.federated_relay_supersessions enable row level security;
alter table public.federated_relay_outbox enable row level security;

revoke all on table public.federated_relay_source_cursors, public.federated_relay_chain_cursors,
  public.federated_relay_public_keys, public.federated_relay_messages,
  public.federated_relay_supersessions, public.federated_relay_outbox
from public, anon, authenticated, service_role;

grant select on table public.federated_relay_source_cursors, public.federated_relay_chain_cursors,
  public.federated_relay_public_keys, public.federated_relay_messages,
  public.federated_relay_supersessions, public.federated_relay_outbox
to service_role;
-- Key lifecycle remains an explicit server-side administration surface. A trigger
-- below freezes identity/material and permits only monotonic lifecycle movement.
grant insert, update on table public.federated_relay_public_keys to service_role;

create or replace function public.federated_relay_guard_message_update_v31()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if (to_jsonb(new) - array['status','superseded_at','superseded_by_message_id'])
     <> (to_jsonb(old) - array['status','superseded_at','superseded_by_message_id']) then
    raise exception 'relay_historical_message_immutable';
  end if;
  if new.status = old.status then return new; end if;
  if old.status='accepted' and new.status in ('superseded','revoked') then return new; end if;
  if old.status='superseded' and new.status='revoked' then return new; end if;
  raise exception 'relay_message_state_nonmonotonic';
end;
$function$;

drop trigger if exists federated_relay_messages_immutable_v31 on public.federated_relay_messages;
create trigger federated_relay_messages_immutable_v31 before update on public.federated_relay_messages
for each row execute function public.federated_relay_guard_message_update_v31();

create or replace function public.federated_relay_guard_key_update_v31()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.member<>old.member or new.key_id<>old.key_id or new.algorithm<>old.algorithm
     or new.public_key_jwk<>old.public_key_jwk or new.valid_from<>old.valid_from then
    raise exception 'relay_key_identity_material_immutable';
  end if;
  if old.valid_until is not null and new.valid_until is distinct from old.valid_until then
    raise exception 'relay_key_valid_until_immutable_once_set';
  end if;
  if old.valid_until is null and new.valid_until is not null and new.valid_until<=new.valid_from then
    raise exception 'relay_key_valid_until_invalid';
  end if;
  if old.state='revoked' and new.state<>'revoked' then raise exception 'relay_key_state_nonmonotonic'; end if;
  if old.state='retiring' and new.state='active' then raise exception 'relay_key_state_nonmonotonic'; end if;
  if new.state='revoked' and new.revoked_at is null then new.revoked_at:=clock_timestamp(); end if;
  new.updated_at:=clock_timestamp();
  return new;
end;
$function$;

drop trigger if exists federated_relay_keys_immutable_v31 on public.federated_relay_public_keys;
create trigger federated_relay_keys_immutable_v31 before update on public.federated_relay_public_keys
for each row execute function public.federated_relay_guard_key_update_v31();

create or replace function public.federated_relay_accept_v31(
  p_contract text,p_message_id uuid,p_semantic_fingerprint char(64),p_delivery_fingerprint char(64),p_receipt_id uuid,
  p_chain_id uuid,p_chain_position bigint,p_relation_type text,p_parent_message_id uuid,p_logical_operation_id uuid,
  p_source_member text,p_source_repository text,p_source_branch text,p_source_head_sha char(40),p_source_key_id text,p_source_sequence bigint,
  p_target_member text,p_target_repository text,p_target_branch text,p_target_head_sha char(40),p_nonce uuid,p_reply_to_message_id uuid,
  p_predecessor_proof_cookie text,p_successor_proof_cookie text,p_payload_sha256 char(64),p_evidence_digest char(64),p_accepted_key_state jsonb,
  p_issued_at timestamptz,p_expires_at timestamptz,p_envelope jsonb,p_receipt jsonb,p_supersedes_message_ids uuid[]
)
returns table(outcome text,stored_receipt jsonb,current_state text,superseded_by_message_id uuid)
language plpgsql security definer set search_path='' as $function$
declare
  source_cursor public.federated_relay_source_cursors%rowtype;
  chain_cursor public.federated_relay_chain_cursors%rowtype;
  existing_record public.federated_relay_messages%rowtype;
  prior_record public.federated_relay_messages%rowtype;
  superseded_id uuid;
  same_direction boolean;
  inverted_direction boolean;
begin
  if p_contract<>'juss/federated-agent-relay@v3.1' then raise exception 'relay_contract'; end if;
  if p_expires_at<=p_issued_at or p_expires_at-p_issued_at>interval '5 minutes' then raise exception 'relay_invalid_expiry'; end if;
  if p_issued_at>clock_timestamp()+interval '30 seconds' then raise exception 'relay_issued_in_future'; end if;
  if p_chain_position<0 or p_source_sequence<0 then raise exception 'relay_ordering_invalid'; end if;
  if p_relation_type not in ('root','reply','revision','reconcile') then raise exception 'relay_relation_type'; end if;

  select m.* into existing_record from public.federated_relay_messages m where m.message_id=p_message_id;
  if found then
    if existing_record.semantic_fingerprint=p_semantic_fingerprint and existing_record.delivery_fingerprint=p_delivery_fingerprint then
      return query select 'duplicate'::text,existing_record.receipt,existing_record.status,existing_record.superseded_by_message_id; return;
    end if;
    raise exception 'relay_message_id_collision';
  end if;

  insert into public.federated_relay_source_cursors(source_member,source_key_id,target_member,target_repository,target_branch)
    values(p_source_member,p_source_key_id,p_target_member,p_target_repository,p_target_branch) on conflict do nothing;
  select c.* into source_cursor from public.federated_relay_source_cursors c
    where c.source_member=p_source_member and c.source_key_id=p_source_key_id and c.target_member=p_target_member
      and c.target_repository=p_target_repository and c.target_branch=p_target_branch for update;

  insert into public.federated_relay_chain_cursors(chain_id) values(p_chain_id) on conflict do nothing;
  select c.* into chain_cursor from public.federated_relay_chain_cursors c where c.chain_id=p_chain_id for update;

  select m.* into existing_record from public.federated_relay_messages m where m.message_id=p_message_id;
  if found then
    if existing_record.semantic_fingerprint=p_semantic_fingerprint and existing_record.delivery_fingerprint=p_delivery_fingerprint then
      return query select 'duplicate'::text,existing_record.receipt,existing_record.status,existing_record.superseded_by_message_id; return;
    end if;
    raise exception 'relay_message_id_collision';
  end if;

  if source_cursor.pending_message_id is not null then raise exception 'relay_source_sequence_pending'; end if;
  if p_source_sequence<>source_cursor.last_sequence+1 then raise exception 'relay_source_sequence_not_next'; end if;
  if chain_cursor.pending_outbound_message_id is not null then raise exception 'relay_chain_outbound_pending'; end if;
  if p_chain_position<>chain_cursor.last_position+1 then raise exception 'relay_chain_position_not_next'; end if;

  if chain_cursor.last_position=-1 then
    if p_relation_type<>'root' or p_chain_position<>0 or p_parent_message_id is not null or p_reply_to_message_id is not null
       or p_predecessor_proof_cookie<>'Q4R:v3.1:genesis' then raise exception 'relay_root_invalid'; end if;
  else
    if p_relation_type='root' then raise exception 'relay_second_root'; end if;
    if p_parent_message_id is null or p_parent_message_id<>chain_cursor.last_message_id then raise exception 'relay_parent_not_current_tip'; end if;
    if p_predecessor_proof_cookie<>chain_cursor.last_successor_cookie then raise exception 'relay_chain_cookie_mismatch'; end if;
    if p_logical_operation_id<>chain_cursor.last_logical_operation_id then raise exception 'relay_parent_operation_mismatch'; end if;
    if p_relation_type<>'reconcile' and chain_cursor.last_expires_at<clock_timestamp() then raise exception 'relay_parent_expired_requires_reconcile'; end if;

    same_direction:=p_source_member=chain_cursor.last_source_member and p_source_repository=chain_cursor.last_source_repository
      and p_source_branch=chain_cursor.last_source_branch and p_target_member=chain_cursor.last_target_member
      and p_target_repository=chain_cursor.last_target_repository and p_target_branch=chain_cursor.last_target_branch;
    inverted_direction:=p_source_member=chain_cursor.last_target_member and p_source_repository=chain_cursor.last_target_repository
      and p_source_branch=chain_cursor.last_target_branch and p_target_member=chain_cursor.last_source_member
      and p_target_repository=chain_cursor.last_source_repository and p_target_branch=chain_cursor.last_source_branch;
    if not(same_direction or inverted_direction) then raise exception 'relay_chain_participant_pair_changed'; end if;
    if p_relation_type='reply' and (not inverted_direction or p_reply_to_message_id<>p_parent_message_id) then raise exception 'relay_reply_identity'; end if;
    if p_relation_type='revision' and not same_direction then raise exception 'relay_revision_direction'; end if;
    if p_relation_type<>'reply' and p_reply_to_message_id is not null then raise exception 'relay_nonreply_reply_to_forbidden'; end if;
  end if;

  if p_relation_type='revision' and coalesce(array_length(p_supersedes_message_ids,1),0)=0 then raise exception 'relay_revision_without_supersession'; end if;
  if p_relation_type<>'revision' and coalesce(array_length(p_supersedes_message_ids,1),0)>0 then raise exception 'relay_supersession_requires_revision'; end if;
  foreach superseded_id in array coalesce(p_supersedes_message_ids,'{}'::uuid[]) loop
    select m.* into prior_record from public.federated_relay_messages m where m.message_id=superseded_id for update;
    if not found or prior_record.status<>'accepted' or prior_record.chain_id<>p_chain_id
       or prior_record.logical_operation_id<>p_logical_operation_id or prior_record.source_member<>p_source_member
       or prior_record.chain_position>=p_chain_position then raise exception 'relay_supersession_invalid'; end if;
    if exists(select 1 from public.federated_relay_supersessions s where s.predecessor_message_id=superseded_id) then raise exception 'relay_supersession_fork'; end if;
  end loop;

  -- Recheck freshness AFTER all potentially blocking locks. clock_timestamp()
  -- advances while waiting; now() would be frozen at transaction start.
  if p_expires_at<clock_timestamp() then raise exception 'relay_expired_after_lock'; end if;

  begin
    insert into public.federated_relay_messages(
      contract,message_id,semantic_fingerprint,delivery_fingerprint,receipt_id,chain_id,chain_position,relation_type,parent_message_id,logical_operation_id,
      source_member,source_repository,source_branch,source_head_sha,source_key_id,source_sequence,target_member,target_repository,target_branch,target_head_sha,
      nonce,reply_to_message_id,predecessor_proof_cookie,successor_proof_cookie,payload_sha256,evidence_digest,accepted_key_state,status,issued_at,expires_at,envelope,receipt
    ) values(
      p_contract,p_message_id,p_semantic_fingerprint,p_delivery_fingerprint,p_receipt_id,p_chain_id,p_chain_position,p_relation_type,p_parent_message_id,p_logical_operation_id,
      p_source_member,p_source_repository,p_source_branch,lower(p_source_head_sha),p_source_key_id,p_source_sequence,p_target_member,p_target_repository,p_target_branch,lower(p_target_head_sha),
      p_nonce,p_reply_to_message_id,p_predecessor_proof_cookie,p_successor_proof_cookie,p_payload_sha256,p_evidence_digest,p_accepted_key_state,'accepted',p_issued_at,p_expires_at,p_envelope,p_receipt
    );
  exception when unique_violation then
    select m.* into existing_record from public.federated_relay_messages m where m.message_id=p_message_id;
    if found and existing_record.semantic_fingerprint=p_semantic_fingerprint and existing_record.delivery_fingerprint=p_delivery_fingerprint then
      return query select 'duplicate'::text,existing_record.receipt,existing_record.status,existing_record.superseded_by_message_id; return;
    end if;
    if found then raise exception 'relay_message_id_collision'; end if;
    if exists(select 1 from public.federated_relay_messages m where m.source_member=p_source_member and m.source_key_id=p_source_key_id and m.nonce=p_nonce) then raise exception 'relay_nonce_reuse'; end if;
    if exists(select 1 from public.federated_relay_messages m where m.source_member=p_source_member and m.source_key_id=p_source_key_id
      and m.target_member=p_target_member and m.target_repository=p_target_repository and m.target_branch=p_target_branch and m.source_sequence=p_source_sequence) then raise exception 'relay_source_sequence_reuse'; end if;
    if exists(select 1 from public.federated_relay_messages m where m.chain_id=p_chain_id and m.chain_position=p_chain_position) then raise exception 'relay_chain_position_reuse'; end if;
    raise;
  end;

  foreach superseded_id in array coalesce(p_supersedes_message_ids,'{}'::uuid[]) loop
    insert into public.federated_relay_supersessions(predecessor_message_id,successor_message_id,chain_id,logical_operation_id)
      values(superseded_id,p_message_id,p_chain_id,p_logical_operation_id);
    update public.federated_relay_messages set status='superseded',superseded_at=clock_timestamp(),superseded_by_message_id=p_message_id
      where message_id=superseded_id and status='accepted';
    if not found then raise exception 'relay_supersession_race'; end if;
  end loop;

  update public.federated_relay_source_cursors set last_sequence=p_source_sequence,last_message_id=p_message_id,updated_at=clock_timestamp()
    where source_member=p_source_member and source_key_id=p_source_key_id and target_member=p_target_member
      and target_repository=p_target_repository and target_branch=p_target_branch;
  update public.federated_relay_chain_cursors set
      last_position=p_chain_position,last_message_id=p_message_id,last_successor_cookie=p_successor_proof_cookie,
      last_logical_operation_id=p_logical_operation_id,last_source_member=p_source_member,last_source_repository=p_source_repository,last_source_branch=p_source_branch,
      last_target_member=p_target_member,last_target_repository=p_target_repository,last_target_branch=p_target_branch,
      last_expires_at=p_expires_at,last_origin='inbound',updated_at=clock_timestamp()
    where chain_id=p_chain_id;
  return query select 'accepted'::text,p_receipt,'accepted'::text,null::uuid;
end;
$function$;

-- Reserve ordering BEFORE signing. One unresolved outbound message per source/target
-- and per chain prevents sequence holes and duplicate chain positions.
create or replace function public.federated_relay_reserve_outbound_v31(
  p_message_id uuid,p_chain_id uuid,p_relation_type text,p_logical_operation_id uuid,
  p_source_member text,p_source_repository text,p_source_branch text,p_source_key_id text,
  p_target_member text,p_target_repository text,p_target_branch text,p_expires_at timestamptz
)
returns table(source_sequence bigint,chain_position bigint,parent_message_id uuid,predecessor_proof_cookie text)
language plpgsql security definer set search_path='' as $function$
declare
  source_cursor public.federated_relay_source_cursors%rowtype;
  chain_cursor public.federated_relay_chain_cursors%rowtype;
  next_sequence bigint;
  next_position bigint;
begin
  if p_relation_type not in ('root','reply','revision','reconcile') then raise exception 'relay_relation_type'; end if;
  insert into public.federated_relay_source_cursors(source_member,source_key_id,target_member,target_repository,target_branch)
    values(p_source_member,p_source_key_id,p_target_member,p_target_repository,p_target_branch) on conflict do nothing;
  select c.* into source_cursor from public.federated_relay_source_cursors c
    where c.source_member=p_source_member and c.source_key_id=p_source_key_id and c.target_member=p_target_member
      and c.target_repository=p_target_repository and c.target_branch=p_target_branch for update;
  if source_cursor.pending_message_id is not null then raise exception 'relay_source_outbound_pending'; end if;

  insert into public.federated_relay_chain_cursors(chain_id) values(p_chain_id) on conflict do nothing;
  select c.* into chain_cursor from public.federated_relay_chain_cursors c where c.chain_id=p_chain_id for update;
  if chain_cursor.pending_outbound_message_id is not null then raise exception 'relay_chain_outbound_pending'; end if;

  if chain_cursor.last_position=-1 then
    if p_relation_type<>'root' then raise exception 'relay_outbound_first_must_root'; end if;
  else
    if p_relation_type='root' then raise exception 'relay_outbound_second_root'; end if;
    if p_relation_type<>'reconcile' and chain_cursor.last_expires_at<clock_timestamp() then raise exception 'relay_parent_expired_requires_reconcile'; end if;
    if not (
      (p_source_member=chain_cursor.last_source_member and p_source_repository=chain_cursor.last_source_repository and p_source_branch=chain_cursor.last_source_branch
       and p_target_member=chain_cursor.last_target_member and p_target_repository=chain_cursor.last_target_repository and p_target_branch=chain_cursor.last_target_branch)
      or
      (p_source_member=chain_cursor.last_target_member and p_source_repository=chain_cursor.last_target_repository and p_source_branch=chain_cursor.last_target_branch
       and p_target_member=chain_cursor.last_source_member and p_target_repository=chain_cursor.last_source_repository and p_target_branch=chain_cursor.last_source_branch)
    ) then raise exception 'relay_chain_participant_pair_changed'; end if;
  end if;

  next_sequence:=source_cursor.last_sequence+1;
  next_position:=chain_cursor.last_position+1;
  insert into public.federated_relay_outbox(
    message_id,chain_id,relation_type,parent_message_id,logical_operation_id,source_member,source_repository,source_branch,source_key_id,source_sequence,
    target_member,target_repository,target_branch,chain_position,predecessor_proof_cookie,expires_at,delivery_status
  ) values(
    p_message_id,p_chain_id,p_relation_type,chain_cursor.last_message_id,p_logical_operation_id,p_source_member,p_source_repository,p_source_branch,p_source_key_id,next_sequence,
    p_target_member,p_target_repository,p_target_branch,next_position,chain_cursor.last_successor_cookie,p_expires_at,'draft'
  );
  update public.federated_relay_source_cursors set last_sequence=next_sequence,last_message_id=p_message_id,pending_message_id=p_message_id,updated_at=clock_timestamp()
    where source_member=p_source_member and source_key_id=p_source_key_id and target_member=p_target_member
      and target_repository=p_target_repository and target_branch=p_target_branch;
  update public.federated_relay_chain_cursors set pending_outbound_message_id=p_message_id,updated_at=clock_timestamp() where chain_id=p_chain_id;
  return query select next_sequence,next_position,chain_cursor.last_message_id,chain_cursor.last_successor_cookie;
end;
$function$;

create or replace function public.federated_relay_finalize_outbound_v31(
  p_message_id uuid,p_semantic_fingerprint char(64),p_delivery_fingerprint char(64),p_envelope jsonb
)
returns void language plpgsql security definer set search_path='' as $function$
declare outbox_record public.federated_relay_outbox%rowtype;
begin
  select o.* into outbox_record from public.federated_relay_outbox o where o.message_id=p_message_id for update;
  if not found or outbox_record.delivery_status<>'draft' then raise exception 'relay_outbox_not_draft'; end if;
  if p_envelope->>'messageId'<>p_message_id::text
    or (p_envelope#>>'{ordering,chainId}')<>outbox_record.chain_id::text
    or (p_envelope#>>'{ordering,sourceSequence}')::bigint<>outbox_record.source_sequence
    or (p_envelope#>>'{ordering,chainPosition}')::bigint<>outbox_record.chain_position
    or (p_envelope#>>'{source,member}')<>outbox_record.source_member
    or (p_envelope#>>'{target,member}')<>outbox_record.target_member
    or p_envelope->>'predecessorProofCookie'<>outbox_record.predecessor_proof_cookie then
    raise exception 'relay_outbox_envelope_reservation_mismatch';
  end if;
  update public.federated_relay_outbox set semantic_fingerprint=p_semantic_fingerprint,delivery_fingerprint=p_delivery_fingerprint,
    envelope=p_envelope,delivery_status='signed',signed_at=clock_timestamp() where message_id=p_message_id;
end;
$function$;

-- The application MUST verify the receiver signature before invoking this RPC.
-- The RPC binds that verified receipt to the exact durable signed outbox message
-- and advances the local chain tip so a sovereign remote reply can be accepted.
create or replace function public.federated_relay_record_outbound_acceptance_v31(
  p_message_id uuid,p_receipt jsonb,p_receiver_current_state text
)
returns void language plpgsql security definer set search_path='' as $function$
declare
  outbox_record public.federated_relay_outbox%rowtype;
  source_cursor public.federated_relay_source_cursors%rowtype;
  chain_cursor public.federated_relay_chain_cursors%rowtype;
  successor_cookie text;
begin
  select o.* into outbox_record from public.federated_relay_outbox o where o.message_id=p_message_id;
  if not found then raise exception 'relay_outbox_missing'; end if;
  select c.* into source_cursor from public.federated_relay_source_cursors c
    where c.source_member=outbox_record.source_member and c.source_key_id=outbox_record.source_key_id and c.target_member=outbox_record.target_member
      and c.target_repository=outbox_record.target_repository and c.target_branch=outbox_record.target_branch for update;
  select c.* into chain_cursor from public.federated_relay_chain_cursors c where c.chain_id=outbox_record.chain_id for update;
  select o.* into outbox_record from public.federated_relay_outbox o where o.message_id=p_message_id for update;
  if outbox_record.delivery_status not in ('signed','sent') then raise exception 'relay_outbox_not_sendable'; end if;
  if source_cursor.pending_message_id<>p_message_id or chain_cursor.pending_outbound_message_id<>p_message_id then raise exception 'relay_outbox_reservation_lost'; end if;
  if p_receiver_current_state not in ('accepted','superseded','revoked') then raise exception 'relay_receiver_state_invalid'; end if;
  if p_receipt->>'messageId'<>p_message_id::text
    or p_receipt->>'semanticFingerprint'<>outbox_record.semantic_fingerprint::text
    or p_receipt->>'deliveryFingerprint'<>outbox_record.delivery_fingerprint::text
    or (p_receipt->>'chainId')<>outbox_record.chain_id::text
    or (p_receipt->>'chainPosition')::bigint<>outbox_record.chain_position
    or coalesce((p_receipt->>'executionAuthorized')::boolean,true)
    or coalesce((p_receipt->>'authorityTransferred')::boolean,true)
    or coalesce((p_receipt->>'approvalCarriedForward')::boolean,true) then
    raise exception 'relay_outbound_receipt_mismatch';
  end if;
  successor_cookie:=p_receipt->>'successorProofCookie';
  if successor_cookie is null or successor_cookie='' then raise exception 'relay_outbound_receipt_cookie_missing'; end if;

  update public.federated_relay_outbox set receipt=p_receipt,receiver_current_state=p_receiver_current_state,
    delivery_status='accepted',resolved_at=clock_timestamp() where message_id=p_message_id;
  update public.federated_relay_source_cursors set pending_message_id=null,updated_at=clock_timestamp()
    where source_member=outbox_record.source_member and source_key_id=outbox_record.source_key_id and target_member=outbox_record.target_member
      and target_repository=outbox_record.target_repository and target_branch=outbox_record.target_branch;
  update public.federated_relay_chain_cursors set
    last_position=outbox_record.chain_position,last_message_id=outbox_record.message_id,last_successor_cookie=successor_cookie,
    last_logical_operation_id=outbox_record.logical_operation_id,last_source_member=outbox_record.source_member,
    last_source_repository=outbox_record.source_repository,last_source_branch=outbox_record.source_branch,
    last_target_member=outbox_record.target_member,last_target_repository=outbox_record.target_repository,last_target_branch=outbox_record.target_branch,
    last_expires_at=outbox_record.expires_at,last_origin='outbound',pending_outbound_message_id=null,updated_at=clock_timestamp()
    where chain_id=outbox_record.chain_id;
end;
$function$;

revoke all on function public.federated_relay_accept_v31(text,uuid,char(64),char(64),uuid,uuid,bigint,text,uuid,uuid,text,text,text,char(40),text,bigint,text,text,text,char(40),uuid,uuid,text,text,char(64),char(64),jsonb,timestamptz,timestamptz,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.federated_relay_accept_v31(text,uuid,char(64),char(64),uuid,uuid,bigint,text,uuid,uuid,text,text,text,char(40),text,bigint,text,text,text,char(40),uuid,uuid,text,text,char(64),char(64),jsonb,timestamptz,timestamptz,jsonb,jsonb,uuid[]) to service_role;
revoke all on function public.federated_relay_reserve_outbound_v31(uuid,uuid,text,uuid,text,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.federated_relay_reserve_outbound_v31(uuid,uuid,text,uuid,text,text,text,text,text,text,text,timestamptz) to service_role;
revoke all on function public.federated_relay_finalize_outbound_v31(uuid,char(64),char(64),jsonb) from public,anon,authenticated;
grant execute on function public.federated_relay_finalize_outbound_v31(uuid,char(64),char(64),jsonb) to service_role;
revoke all on function public.federated_relay_record_outbound_acceptance_v31(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.federated_relay_record_outbound_acceptance_v31(uuid,jsonb,text) to service_role;

comment on function public.federated_relay_accept_v31(text,uuid,char(64),char(64),uuid,uuid,bigint,text,uuid,uuid,text,text,text,char(40),text,bigint,text,text,text,char(40),uuid,uuid,text,text,char(64),char(64),jsonb,timestamptz,timestamptz,jsonb,jsonb,uuid[]) is
'Atomic inbound v3.1 acceptance. Uses target-scoped source sequencing, authenticated local chain tips spanning inbound/outbound messages, post-lock freshness, immutable historical receipts, and zero execution authority.';
