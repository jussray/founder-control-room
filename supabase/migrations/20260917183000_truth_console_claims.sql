-- Durable founder truth-console records.
-- Reuses existing evidence, reconciliation_runs, truth_snapshots, and
-- continuity_records as the authoritative proof spine instead of duplicating them.

create table if not exists truth_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 4000),
  classification text not null default 'unknown'
    check (classification in ('verified','inferred','unknown','blocked','conflicted','stale')),
  revision bigint not null default 1 check (revision > 0),
  created_by text not null,
  current_truth_snapshot_id uuid references truth_snapshots(id) on delete set null,
  current_subject_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table truth_claims is 'Founder-authored claims whose proof state is derived from existing evidence, truth snapshots, reconciliation receipts, and continuity records.';

create table if not exists truth_claim_evidence (
  claim_id uuid not null references truth_claims(id) on delete cascade,
  evidence_id uuid not null references evidence(id) on delete cascade,
  relation text not null default 'supports'
    check (relation in ('supports','contradicts','context')),
  created_at timestamptz not null default now(),
  primary key (claim_id, evidence_id)
);
comment on table truth_claim_evidence is 'Links normalized evidence to a truth claim without copying or mutating the source evidence receipt.';

create table if not exists truth_attacks (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references truth_claims(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  attack_type text not null default 'version'
    check (attack_type in ('version','premise','evidence','authority','runtime')),
  challenge text not null check (char_length(challenge) between 1 and 4000),
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  status text not null default 'open'
    check (status in ('open','resolved')),
  created_by text not null,
  resolution_answer text,
  resolution_evidence_id uuid references evidence(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table truth_attacks is 'Founder-visible challenge ledger. Resolving an attack can invalidate continuity but never grants authority.';

create index if not exists truth_claims_project_updated_idx on truth_claims(project_id, updated_at desc);
create index if not exists truth_claim_evidence_claim_idx on truth_claim_evidence(claim_id, created_at desc);
create index if not exists truth_attacks_claim_created_idx on truth_attacks(claim_id, created_at desc);
create index if not exists truth_attacks_project_status_idx on truth_attacks(project_id, status, created_at desc);

alter table truth_claims enable row level security;
alter table truth_claim_evidence enable row level security;
alter table truth_attacks enable row level security;

revoke all on table truth_claims from anon, authenticated;
revoke all on table truth_claim_evidence from anon, authenticated;
revoke all on table truth_attacks from anon, authenticated;

grant select, insert, update, delete on table truth_claims to service_role;
grant select, insert, update, delete on table truth_claim_evidence to service_role;
grant select, insert, update, delete on table truth_attacks to service_role;

-- Truth-console writes are multi-record proof transitions. Keep them inside one
-- database transaction so an evidence insert, continuity invalidation, receipt,
-- and claim state can never partially succeed. SECURITY INVOKER preserves the
-- caller's service-role boundary instead of manufacturing new database authority.
create or replace function truth_console_attach_evidence(
  p_claim_id uuid,
  p_kind text,
  p_status text,
  p_relation text,
  p_provider text,
  p_details_ref text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim truth_claims%rowtype;
  v_evidence evidence%rowtype;
  v_invalidated jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  select * into v_claim
  from truth_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'truth_claim_not_found' using errcode = 'P0002';
  end if;

  insert into evidence(project_id, subject, kind, status, provider, environment, details_ref)
  values (v_claim.project_id, v_claim.statement, p_kind, p_status, p_provider, 'truth-console', p_details_ref)
  returning * into v_evidence;

  insert into truth_claim_evidence(claim_id, evidence_id, relation)
  values (v_claim.id, v_evidence.id, p_relation);

  with invalidated as (
    update continuity_records
    set invalidated_at = v_now,
        invalidation_reason = 'claim_evidence_changed'
    where project_id = v_claim.project_id
      and subject_fingerprint = v_claim.current_subject_fingerprint
      and v_claim.current_subject_fingerprint is not null
      and invalidated_at is null
    returning id, proof_cookie, subject_fingerprint, invalidated_at, invalidation_reason
  )
  select coalesce(jsonb_agg(to_jsonb(invalidated)), '[]'::jsonb)
  into v_invalidated
  from invalidated;

  update truth_claims
  set classification = 'stale',
      revision = revision + 1,
      current_truth_snapshot_id = null,
      updated_at = v_now
  where id = v_claim.id
  returning * into v_claim;

  return jsonb_build_object(
    'evidence', to_jsonb(v_evidence) || jsonb_build_object('relation', p_relation),
    'claim', to_jsonb(v_claim),
    'invalidatedContinuity', v_invalidated,
    'authorityEffect', 'none'
  );
end;
$$;

create or replace function truth_console_reconcile_claim(
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

  v_evidence_fingerprint := encode(digest(convert_to(v_identity::text, 'UTF8'), 'sha256'), 'hex');
  v_subject_fingerprint := encode(digest(convert_to(
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

  v_proof_cookie := 'fcr-proof-v1:' || left(encode(digest(convert_to(
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

create or replace function truth_console_resolve_attack(
  p_attack_id uuid,
  p_answer text,
  p_evidence_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attack truth_attacks%rowtype;
  v_claim truth_claims%rowtype;
  v_invalidated jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  select * into v_attack
  from truth_attacks
  where id = p_attack_id
  for update;

  if not found then
    raise exception 'truth_attack_not_found' using errcode = 'P0002';
  end if;

  if v_attack.status = 'resolved' then
    raise exception 'truth_attack_already_resolved' using errcode = '23505';
  end if;

  select * into v_claim
  from truth_claims
  where id = v_attack.claim_id
  for update;

  if not found then
    raise exception 'truth_claim_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from truth_claim_evidence
    where claim_id = v_claim.id
      and evidence_id = p_evidence_id
  ) then
    raise exception 'truth_attack_evidence_not_linked' using errcode = '23503';
  end if;

  with invalidated as (
    update continuity_records
    set invalidated_at = v_now,
        invalidation_reason = 'attack_resolution_changed_truth'
    where project_id = v_claim.project_id
      and subject_fingerprint = v_claim.current_subject_fingerprint
      and v_claim.current_subject_fingerprint is not null
      and invalidated_at is null
    returning id, proof_cookie, subject_fingerprint, invalidated_at, invalidation_reason
  )
  select coalesce(jsonb_agg(to_jsonb(invalidated)), '[]'::jsonb)
  into v_invalidated
  from invalidated;

  update truth_claims
  set classification = 'stale',
      revision = revision + 1,
      current_truth_snapshot_id = null,
      updated_at = v_now
  where id = v_claim.id
  returning * into v_claim;

  update truth_attacks
  set status = 'resolved',
      resolution_answer = p_answer,
      resolution_evidence_id = p_evidence_id,
      resolved_at = v_now,
      updated_at = v_now
  where id = v_attack.id
  returning * into v_attack;

  return jsonb_build_object(
    'attack', to_jsonb(v_attack),
    'claim', to_jsonb(v_claim),
    'invalidatedContinuity', v_invalidated,
    'cookieState', 'stale',
    'authorityEffect', 'none'
  );
end;
$$;

revoke all on function truth_console_attach_evidence(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function truth_console_reconcile_claim(uuid, bigint) from public, anon, authenticated;
revoke all on function truth_console_resolve_attack(uuid, text, uuid) from public, anon, authenticated;

grant execute on function truth_console_attach_evidence(uuid, text, text, text, text, text) to service_role;
grant execute on function truth_console_reconcile_claim(uuid, bigint) to service_role;
grant execute on function truth_console_resolve_attack(uuid, text, uuid) to service_role;
