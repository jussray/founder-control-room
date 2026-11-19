-- Close the concurrent first-delivery exact-retry race without rewriting
-- 20260913203000_federated_relay_v31.sql.
--
-- The original function checks for a duplicate before locking cursors. Two
-- simultaneous first deliveries can both miss that lookup. The successor
-- rechecks the durable message after source -> chain cursor locks and before
-- sequence advancement, preserving one immutable receipt for an exact retry.

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

  -- First-sighting exact retries can both miss the pre-lock lookup. After
  -- serializing on the source and chain cursors, re-read the durable message
  -- before sequence checks so the loser returns the original receipt instead
  -- of a false relay_source_sequence_not_next failure.
  select * into v_existing
  from public.federated_relay_v31_messages
  where message_id = p_message_id;
  if found then
    if v_existing.semantic_fingerprint <> p_semantic_fingerprint
       or v_existing.delivery_fingerprint <> p_delivery_fingerprint then
      raise exception 'relay_message_id_collision';
    end if;
    return query
      select 'duplicate'::text,
             v_existing.receipt,
             v_existing.status,
             v_existing.superseded_by_message_id;
    return;
  end if;

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
