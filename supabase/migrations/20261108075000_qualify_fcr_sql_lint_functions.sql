-- Forward-only correction for Supabase SQL lint, retaining historical migrations.
-- Preserve original security, role, and lease-consumption semantics.
-- Do not apply to live provider without separate reviewed release authorization.

begin;

do $$
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Required extensions.digest(bytea,text) missing; no function altered';
  end if;
end;
$$;

create or replace function public.truth_console_reconcile_claim(
  p_claim_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim truth_claims%rowtype;
  v_snapshot truth_snapshots%rowtype;
  v_continuity continuity_records%rowtype;
  v_receipt reconciliation_runs%rowtype;
  v_identity jsonb := '[]'::jsonb;
  v_evidence_ids jsonb := '[]'::jsonb;
  v_evidence_count bigint := 0;
  v_has_conflict boolean := false;
  v_has_support boolean := false;
  v_all_support_pass boolean := true;
  v_has_independent_support boolean := false;
  v_has_pending boolean := false;
  v_classification text;
  v_evidence_fingerprint text;
  v_subject_fingerprint text;
  v_proof_cookie text;
  v_now timestamptz := now();
  v_valid_until timestamptz := now() + interval '7 days';
begin
  select * into v_claim
  from truth_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'truth_claim_not_found' using errcode = 'P0002';
  end if;

  if v_claim.revision <> p_expected_revision then
    raise exception 'truth_claim_revision_mismatch' using errcode = '40001';
  end if;

  select
    count(*),
    coalesce(bool_or(l.relation = 'contradicts' or e.status = 'fail'), false),
    coalesce(bool_or(l.relation = 'supports'), false),
    coalesce(bool_and(case when l.relation = 'supports' then e.status = 'pass' else true end), true),
    coalesce(bool_or(
      l.relation = 'supports'
      and e.status = 'pass'
      and e.provider in ('github','cloudflare','supabase','playwright')
      and coalesce(e.environment, '') <> 'truth-console'
    ), false),
    coalesce(bool_or(e.status = 'pending'), false),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', e.id::text,
        'status', e.status,
        'relation', l.relation,
        'provider', e.provider,
        'kind', e.kind,
        'environment', e.environment
      )
      order by e.id::text
    ), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(e.id::text) order by e.id::text), '[]'::jsonb)
  into
    v_evidence_count,
    v_has_conflict,
    v_has_support,
    v_all_support_pass,
    v_has_independent_support,
    v_has_pending,
    v_identity,
    v_evidence_ids
  from truth_claim_evidence l
  join evidence e on e.id = l.evidence_id
  where l.claim_id = v_claim.id;

  if v_evidence_count = 0 then
    v_classification := 'unknown';
  elsif v_has_conflict then
    v_classification := 'conflicted';
  elsif v_has_support and v_all_support_pass and v_has_independent_support then
    v_classification := 'verified';
  elsif v_has_pending then
    v_classification := 'unknown';
  else
    -- Founder/manual observation may support an inference, but it cannot self-promote
    -- a claim to VERIFIED. Verified requires independent provider/runtime readback.
    v_classification := 'inferred';
  end if;

  v_evidence_fingerprint := encode(extensions.digest(convert_to(v_identity::text, 'UTF8'), 'sha256'), 'hex');
  v_subject_fingerprint := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'contract', 'fcr/truth-claim-subject@v1',
      'claimId', v_claim.id::text,
      'projectId', v_claim.project_id::text,
      'statement', v_claim.statement,
      'revision', v_claim.revision
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into truth_snapshots(
    project_id,
    source_truth,
    outcome_truth,
    classification,
    observed_at,
    expires_at
  ) values (
    v_claim.project_id,
    jsonb_build_object(
      'contract', 'fcr/truth-claim@v1',
      'claimId', v_claim.id::text,
      'statement', v_claim.statement,
      'revision', v_claim.revision,
      'evidenceIds', v_evidence_ids
    ),
    jsonb_build_object('classification', v_classification),
    v_classification,
    v_now,
    v_valid_until
  )
  returning * into v_snapshot;

  update continuity_records
  set invalidated_at = v_now,
      invalidation_reason = 'superseded_by_reconciliation'
  where project_id = v_claim.project_id
    and subject_fingerprint = v_claim.current_subject_fingerprint
    and v_claim.current_subject_fingerprint is not null
    and invalidated_at is null;

  v_proof_cookie := 'fcr-proof-v1:' || left(encode(extensions.digest(convert_to(
    v_subject_fingerprint || ':' || v_evidence_fingerprint || ':' || v_snapshot.id::text,
    'UTF8'
  ), 'sha256'), 'hex'), 40);

  insert into continuity_records(
    project_id,
    subject_fingerprint,
    proof_cookie,
    truth_snapshot_id,
    evidence_fingerprint,
    valid_until
  ) values (
    v_claim.project_id,
    v_subject_fingerprint,
    v_proof_cookie,
    v_snapshot.id,
    v_evidence_fingerprint,
    v_valid_until
  )
  returning * into v_continuity;

  insert into reconciliation_runs(
    project_id,
    controller,
    resource_id,
    reason,
    status,
    observed_changes,
    proposed_actions,
    evidence_ids,
    requires_approval,
    message,
    completed_at
  ) values (
    v_claim.project_id,
    'TruthConsole',
    v_claim.id::text,
    'founder_truth_reconciliation',
    case when v_classification = 'verified' then 'converged' else 'drifted' end,
    jsonb_build_array(jsonb_build_object('classification', v_classification, 'revision', v_claim.revision)),
    case when v_classification = 'verified'
      then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('action', 'review_evidence', 'authority', 'none'))
    end,
    v_evidence_ids,
    false,
    'Truth claim reconciled as ' || v_classification,
    v_now
  )
  returning * into v_receipt;

  update truth_claims
  set classification = v_classification,
      current_truth_snapshot_id = v_snapshot.id,
      current_subject_fingerprint = v_subject_fingerprint,
      updated_at = v_now
  where id = v_claim.id
  returning * into v_claim;

  return jsonb_build_object(
    'claim', to_jsonb(v_claim),
    'snapshot', to_jsonb(v_snapshot),
    'receipt', to_jsonb(v_receipt),
    'continuity', to_jsonb(v_continuity) || jsonb_build_object('state', 'current'),
    'authorityEffect', 'none'
  );
end;
$$;

create or replace function public.claim_revenue_strike_customer_send_lease(
  p_run_id text,
  p_slot smallint,
  p_founder_user_id text,
  p_recipient_fingerprint text,
  p_prospect_fingerprint text,
  p_message_fingerprint text,
  p_offer_fingerprint text,
  p_historical_ledger_digest text,
  p_reply_gate_clear_at timestamptz,
  p_claimed_by text,
  p_claimed_at timestamptz
)
returns table (
  claim_id uuid,
  run_id text,
  slot smallint,
  recipient_fingerprint text,
  claimed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  lease_row public.revenue_strike_customer_send_leases%rowtype;
  run_send_count bigint;
begin
  if coalesce(btrim(p_run_id), '') = ''
    or p_slot is null or p_slot not between 1 and 5
    or coalesce(btrim(p_founder_user_id), '') = ''
    or coalesce(btrim(p_claimed_by), '') = ''
    or p_reply_gate_clear_at is null
    or p_claimed_at is null then
    return;
  end if;

  if lower(btrim(p_recipient_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_prospect_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_message_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_offer_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_historical_ledger_digest)) !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- A reply-first observation is a short-lived precondition. A later reply can
  -- invalidate the batch outside this database, so stale observations fail closed.
  if p_reply_gate_clear_at > p_claimed_at
    or p_claimed_at - p_reply_gate_clear_at > interval '15 minutes' then
    return;
  end if;

  -- Serialize all lease claims for one strike run. This makes the five-send
  -- ceiling a database invariant under concurrent workers instead of a prompt counter.
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_run_id), 0));

  select count(*)
    into run_send_count
    from public.revenue_strike_customer_send_leases as count_leases
   where count_leases.run_id = btrim(p_run_id);

  if run_send_count >= 5 then
    return;
  end if;

  -- A claimed recipient is permanently ineligible for another cold-strike lease,
  -- including when a provider later rejects or returns an ambiguous result.
  if exists (
    select 1
      from public.revenue_strike_customer_send_leases as recipient_leases
     where recipient_leases.recipient_fingerprint = lower(btrim(p_recipient_fingerprint))
  ) then
    return;
  end if;

  if exists (
    select 1
      from public.revenue_strike_customer_send_leases as slot_leases
     where slot_leases.run_id = btrim(p_run_id)
       and slot_leases.slot = p_slot
  ) then
    return;
  end if;

  insert into public.revenue_strike_customer_send_leases (
    run_id,
    slot,
    founder_user_id,
    recipient_fingerprint,
    prospect_fingerprint,
    message_fingerprint,
    offer_fingerprint,
    historical_ledger_digest,
    reply_gate_clear_at,
    claimed_by,
    claimed_at,
    provider_outcome
  ) values (
    btrim(p_run_id),
    p_slot,
    btrim(p_founder_user_id),
    lower(btrim(p_recipient_fingerprint)),
    lower(btrim(p_prospect_fingerprint)),
    lower(btrim(p_message_fingerprint)),
    lower(btrim(p_offer_fingerprint)),
    lower(btrim(p_historical_ledger_digest)),
    p_reply_gate_clear_at,
    btrim(p_claimed_by),
    p_claimed_at,
    'claimed'
  )
  returning * into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.run_id,
      lease_row.slot,
      lease_row.recipient_fingerprint,
      lease_row.claimed_at;
exception
  when unique_violation then
    return;
end;
$function$;

create or replace function public.finalize_revenue_strike_customer_send_lease(
  p_claim_id uuid,
  p_founder_user_id text,
  p_provider_outcome text,
  p_provider_receipt_id text,
  p_finalized_at timestamptz
)
returns table (
  claim_id uuid,
  provider_outcome text,
  provider_receipt_id text,
  finalized_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  lease_row public.revenue_strike_customer_send_leases%rowtype;
begin
  if p_claim_id is null
    or coalesce(btrim(p_founder_user_id), '') = ''
    or p_provider_outcome not in ('accepted', 'rejected', 'unknown')
    or p_finalized_at is null
    or (p_provider_outcome = 'accepted' and coalesce(btrim(p_provider_receipt_id), '') = '') then
    return;
  end if;

  select l.*
    into lease_row
    from public.revenue_strike_customer_send_leases l
   where l.claim_id = p_claim_id
     and l.founder_user_id = btrim(p_founder_user_id)
     and l.provider_outcome = 'claimed'
     and l.finalized_at is null
   for update;

  if not found then
    return;
  end if;

  update public.revenue_strike_customer_send_leases as target_lease
     set provider_outcome = p_provider_outcome,
         provider_receipt_id = nullif(btrim(p_provider_receipt_id), ''),
         finalized_at = p_finalized_at
   where target_lease.claim_id = lease_row.claim_id
     and target_lease.provider_outcome = 'claimed'
     and target_lease.finalized_at is null
  returning * into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.provider_outcome,
      lease_row.provider_receipt_id,
      lease_row.finalized_at;
end;
$function$;

commit;
