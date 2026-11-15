\set ON_ERROR_STOP on
-- CI-only exact-head FCR Learning OS proof. Canonical predecessor SQL is used
-- to prepare the empty Neon branch, the candidate migration runs unchanged,
-- and all fixture objects are rolled back. No public or production effects.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL
);

CREATE TABLE public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  mission_id uuid,
  subject text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  commit_sha text,
  environment text,
  details_ref text,
  reusable_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.truth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_truth jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_truth jsonb NOT NULL DEFAULT '{}'::jsonb,
  classification text NOT NULL,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz
);

CREATE TABLE public.continuity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_fingerprint text,
  proof_cookie text NOT NULL,
  truth_snapshot_id uuid REFERENCES public.truth_snapshots(id) ON DELETE SET NULL,
  evidence_fingerprint text,
  valid_until timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  controller text NOT NULL,
  resource_id text,
  reason text,
  status text NOT NULL,
  observed_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_approval boolean NOT NULL DEFAULT false,
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
-- These table definitions come from the original FCR migrations.
create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'proposed' check (status in (
    'proposed', 'sandboxed', 'in_review', 'approved', 'integrated', 'deployed', 'rejected', 'rolled_back'
  )),
  base_ref text,
  branch_ref text,
  builder_agent text,                        -- e.g. "codex", "claude-code", "cursor"
  reviewer_agent text,
  risk_level text default 'medium' check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists approval_executions (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid references missions(id) on delete set null,
  project_id       uuid not null references projects(id) on delete cascade,
  action_type      text not null,
  idempotency_key  text not null unique,
  executed_by      text not null,
  status           text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  request          jsonb not null default '{}'::jsonb,
  result           jsonb not null default '{}'::jsonb,
  success          boolean,
  started_at       timestamptz not null default now(),
  executed_at      timestamptz
);
ALTER TABLE public.approval_executions ADD COLUMN expected_head_sha text
  CHECK(expected_head_sha IS NULL OR expected_head_sha ~ '^[0-9a-f]{40}$');
create table if not exists founder_intents (
  id uuid primary key default gen_random_uuid(),
  outcome_wanted text not null,
  why text,
  constraints jsonb not null default '{}'::jsonb,
  consequence_ceiling text not null default 'reversible' check (consequence_ceiling in ('informational','reversible','consequential','irreversible')),
  success_criteria jsonb not null default '[]'::jsonb,
  priority integer not null default 50 check (priority between 0 and 100),
  authority_policy jsonb not null default '{}'::jsonb,
  truth_lease_expires_at timestamptz,
  status text not null default 'active' check (status in ('draft','active','satisfied','paused','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists outcomes (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid not null references founder_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  intended_outcome text not null,
  actual_outcome text,
  evidence jsonb not null default '[]'::jsonb,
  verification_method text,
  classification text not null default 'unknown' check (classification in ('achieved','partial','failed','unknown')),
  observed_at timestamptz,
  follow_up text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
\ir ../migrations/20260827224500_founder_permission_requests.sql
\ir ../migrations/20260829055000_harden_founder_permission_broker.sql
-- Original revenue-strike source functions and permission boundary before repair.
create table if not exists public.revenue_strike_customer_send_leases (
  claim_id uuid primary key default gen_random_uuid(),
  run_id text not null,
  slot smallint not null check (slot between 1 and 5),
  founder_user_id text not null,
  recipient_fingerprint text not null,
  prospect_fingerprint text not null,
  message_fingerprint text not null,
  offer_fingerprint text not null,
  historical_ledger_digest text not null,
  reply_gate_clear_at timestamptz not null,
  claimed_by text not null,
  claimed_at timestamptz not null default now(),
  provider_outcome text not null default 'claimed'
    check (provider_outcome in ('claimed', 'accepted', 'rejected', 'unknown')),
  provider_receipt_id text,
  finalized_at timestamptz,
  constraint revenue_strike_customer_send_recipient_sha256
    check (recipient_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint revenue_strike_customer_send_prospect_sha256
    check (prospect_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint revenue_strike_customer_send_message_sha256
    check (message_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint revenue_strike_customer_send_offer_sha256
    check (offer_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint revenue_strike_customer_send_ledger_sha256
    check (historical_ledger_digest ~ '^[0-9a-f]{64}$'),
  constraint revenue_strike_customer_send_accepted_receipt
    check (provider_outcome <> 'accepted' or coalesce(btrim(provider_receipt_id), '') <> ''),
  unique (recipient_fingerprint),
  unique (run_id, slot)
);

ALTER TABLE public.revenue_strike_customer_send_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.revenue_strike_customer_send_leases FROM public, anon, authenticated;

GRANT SELECT,INSERT,UPDATE ON public.revenue_strike_customer_send_leases TO service_role;

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
    from public.revenue_strike_customer_send_leases
   where run_id = btrim(p_run_id);

  if run_send_count >= 5 then
    return;
  end if;

  -- A claimed recipient is permanently ineligible for another cold-strike lease,
  -- including when a provider later rejects or returns an ambiguous result.
  if exists (
    select 1
      from public.revenue_strike_customer_send_leases
     where recipient_fingerprint = lower(btrim(p_recipient_fingerprint))
  ) then
    return;
  end if;

  if exists (
    select 1
      from public.revenue_strike_customer_send_leases
     where run_id = btrim(p_run_id)
       and slot = p_slot
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

REVOKE ALL ON FUNCTION public.claim_revenue_strike_customer_send_lease(text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_revenue_strike_customer_send_lease(text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz) TO service_role;

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

  update public.revenue_strike_customer_send_leases
     set provider_outcome = p_provider_outcome,
         provider_receipt_id = nullif(btrim(p_provider_receipt_id), ''),
         finalized_at = p_finalized_at
   where claim_id = lease_row.claim_id
     and provider_outcome = 'claimed'
     and finalized_at is null
  returning * into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.provider_outcome,
      lease_row.provider_receipt_id,
      lease_row.finalized_at;
end;
$function$;

REVOKE ALL ON FUNCTION public.finalize_revenue_strike_customer_send_lease(uuid, text, text, text, timestamptz) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_revenue_strike_customer_send_lease(uuid, text, text, text, timestamptz) TO service_role;
-- Actual truth-console predecessor and candidate migration, not stubs.
\ir ../migrations/20260917183000_truth_console_claims.sql
\ir ../migrations/20261106173000_learning_os_v1.sql
-- The Neon branch is empty. Recreate the exact columns/constraints of the
-- canonical 20260711214937_proof_gate_results source for this transaction only.
-- Do not import its old auth.role() RLS policies into the preview fixture.
CREATE TABLE public.proof_gate_results (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  gate_id text not null,
  status text not null check (status in ('pass','fail','skipped')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by text,
  ran_at timestamptz not null default now()
);
\ir ../migrations/20261106193000_learning_os_proof_binding_v2.sql
\ir ../migrations/20261106195000_learning_os_retirement_binding_v3.sql

-- Runtime contract, not a "migration parsed" shortcut: source provenance,
-- state advancement, founder retirement authority, hashes and lease semantics.
DO $learning_proof$
DECLARE
  v_project uuid := gen_random_uuid();
  v_intent uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_next uuid := gen_random_uuid();
  v_first_execution uuid := gen_random_uuid();
  v_next_execution uuid := gen_random_uuid();
  v_first_outcome uuid := gen_random_uuid();
  v_next_outcome uuid := gen_random_uuid();
  v_learning uuid;
  v_permission uuid := gen_random_uuid();
  v_cross_permission uuid := gen_random_uuid();
  v_cross_reason text := 'Shared validation technique directly applies to this new domain';
  v_truth uuid;
  v_truth_result jsonb;
  v_lease uuid;
  v_rejected boolean := false;
BEGIN
  INSERT INTO public.projects(id,slug,name) VALUES
    (v_project,'learning-os-preview','Learning OS Preview');
  INSERT INTO public.missions(id,project_id,title) VALUES
    (v_first,v_project,'Origin source'), (v_next,v_project,'Later independent source');
  INSERT INTO public.founder_intents(id,outcome_wanted)
    VALUES (v_intent,'Prove the knowledge lifecycle');
  INSERT INTO public.approval_executions(
    id,mission_id,project_id,action_type,idempotency_key,executed_by,
    status,success,executed_at,expected_head_sha
  ) VALUES
    (v_first_execution,v_first,v_project,'preview','learning-preview-source','ci',
     'succeeded',true,now()-interval '3 minutes',repeat('a',40)),
    (v_next_execution,v_next,v_project,'preview','learning-preview-target','ci',
     'succeeded',true,now()-interval '2 minutes',repeat('b',40));
  INSERT INTO public.outcomes(
    id,founder_intent_id,project_id,mission_id,intended_outcome,
    evidence,verification_method,classification,observed_at
  ) VALUES
    (v_first_outcome,v_intent,v_project,v_first,'Verified source outcome',
     '["github://source"]'::jsonb,'provider','achieved',now()-interval '2 minutes'),
    (v_next_outcome,v_intent,v_project,v_next,'Verified downstream outcome',
     '["github://next"]'::jsonb,'provider','achieved',now()-interval '1 minute');
  INSERT INTO public.learning_mission_domains(mission_id,project_id,domain,source_ref)
  VALUES (v_first,v_project,'ci','github://source'),
         (v_next,v_project,'auth','github://next');
  INSERT INTO public.learning_records(
    outcome_id,origin_execution_id,origin_mission_id,origin_project_id,
    origin_head_sha,domain,outcome_summary,observed_by
  ) VALUES (
    v_first_outcome,v_first_execution,v_first,v_project,repeat('a',40),
    'ci','Verified execution and source outcome','provider'
  ) RETURNING id INTO v_learning;

  BEGIN
    PERFORM public.learning_progress(v_learning,'INTERPRETED','RETAINED','{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LEARNING_STALE_STATE%' THEN v_rejected := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'stale learning state accepted'; END IF;

  PERFORM public.learning_progress(v_learning,'OUTCOME_RECORDED','SIGNAL_EXTRACTED',
    jsonb_build_object('signal_class','repeatable',
      'description','The source run proved this repeatable outcome',
      'evidence_refs',jsonb_build_array('github://source')));
  PERFORM public.learning_progress(v_learning,'SIGNAL_EXTRACTED','INTERPRETED',
    jsonb_build_object('hypothesis','The proof can be reused with fresh authority',
      'confidence','high','confidence_basis','Source and provider observation align'));
  PERFORM public.learning_progress(v_learning,'INTERPRETED','RETAINED','{}'::jsonb);
  -- Unrelated-domain reuse without explicit permission must be rejected.
  v_rejected := false;
  BEGIN
    PERFORM public.learning_apply_verified(
      v_learning,'RETAINED',v_next_execution,v_next_outcome,'auth',
      'Attempt cross-domain reuse without consent',v_cross_reason,null);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LEARNING_CROSS_DOMAIN_FOUNDER_APPROVAL_REQUIRED%' THEN
      v_rejected := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'unapproved cross-domain reuse accepted'; END IF;
  IF EXISTS(SELECT 1 FROM public.learning_applications WHERE learning_id=v_learning)
    THEN RAISE EXCEPTION 'failed promotion left an application behind'; END IF;

  INSERT INTO public.founder_permission_requests(
    id,request_id,request_contract,requested_by_surface,request_hash,
    proposal,status,decision,decision_hash,decision_surface,founder_user_id,
    decided_at,action_target,expires_at
  ) VALUES (
    v_cross_permission,'learning-preview-cross-domain','juss-v10/founder-permission-request@v1',
    'fcr',repeat('c',64),
    jsonb_build_object('actionType','apply_learning_cross_domain',
      'projectSlug','learning-os-preview','expectedHeadSha',repeat('b',40)),
    'approved',jsonb_build_object('decision','approved','founderExplicit',true),repeat('d',64),
    'fcr',gen_random_uuid(),now()-interval '1 minute',
    jsonb_build_object('type','learning_application','learningId',v_learning::text,
      'targetMissionId',v_next::text,'targetOutcomeId',v_next_outcome::text,
      'targetHeadSha',repeat('b',40),'targetDomain','auth',
      'crossDomainReason',v_cross_reason),
    now()+interval '10 minutes'
  );
  PERFORM public.learning_apply_verified(
    v_learning,'RETAINED',v_next_execution,v_next_outcome,'auth',
    'Applied with independent outcome and founder cross-domain approval',v_cross_reason,v_cross_permission);
  IF (SELECT consumed_at FROM public.founder_permission_requests WHERE id=v_cross_permission) IS NULL
     THEN RAISE EXCEPTION 'cross-domain permission was not consumed atomically'; END IF;
  IF (SELECT count(*) FROM public.learning_applications WHERE learning_id=v_learning) <> 1
     THEN RAISE EXCEPTION 'unexpected application count after promotion'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.learning_apply_verified(
      v_learning,'RETAINED',v_next_execution,v_next_outcome,'auth',
      'Second contender must lose',v_cross_reason,v_cross_permission);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LEARNING_STALE_STATE%' THEN v_rejected := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'second promotion incorrectly succeeded'; END IF;
  IF (SELECT count(*) FROM public.learning_applications WHERE learning_id=v_learning) <> 1
     THEN RAISE EXCEPTION 'duplicate application inserted after contention'; END IF;
  PERFORM public.learning_progress(v_learning,'APPLIED','REVISED',
    jsonb_build_object('downstream_outcome_id',v_next_outcome,'outcome','held',
      'demonstrated_improvement',true,'metric_before',1,'metric_after',2,
      'better_when','higher','evidence_refs',jsonb_build_array('github://next'),
      'revision','Independent downstream improvement recorded'));
  IF (SELECT state FROM public.learning_records WHERE id=v_learning) <> 'REVISED'
    OR NOT EXISTS(SELECT 1 FROM public.learning_application_reviews
                  WHERE downstream_outcome_id=v_next_outcome
                    AND demonstrated_improvement) THEN
    RAISE EXCEPTION 'real learning lifecycle failed to reach REVISED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.learning_progress(v_learning,'REVISED','RETIRED',
      jsonb_build_object('founder_permission_id',gen_random_uuid()));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LEARNING_FOUNDER_RETIREMENT_APPROVAL_REQUIRED%' THEN
      v_rejected := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'unapproved retirement accepted'; END IF;

  INSERT INTO public.founder_permission_requests(
    id,request_id,request_contract,requested_by_surface,request_hash,
    proposal,status,decision,decision_hash,decision_surface,founder_user_id,
    decided_at,action_target,expires_at
  ) VALUES (
    v_permission,'learning-preview-retirement','juss-v10/founder-permission-request@v1',
    'fcr',repeat('c',64),
    jsonb_build_object('actionType','retire_learning',
      'projectSlug','learning-os-preview','expectedHeadSha',repeat('a',40)),
    'approved',jsonb_build_object('decision','approved','founderExplicit',true),repeat('d',64),
    'fcr',gen_random_uuid(),now()-interval '1 minute',
    jsonb_build_object('type','learning_retirement','learningId',v_learning::text,
      'originHeadSha',repeat('a',40)),
    now()+interval '10 minutes'
  );
  PERFORM public.learning_progress(v_learning,'REVISED','RETIRED',
    jsonb_build_object('founder_permission_id',v_permission));
  IF (SELECT state FROM public.learning_records WHERE id=v_learning) <> 'RETIRED'
    OR (SELECT consumed_at FROM public.founder_permission_requests WHERE id=v_permission) IS NULL
     THEN RAISE EXCEPTION 'authorized retirement did not consume the founder decision'; END IF;

  INSERT INTO public.truth_claims(project_id,statement,created_by)
  VALUES (v_project,'Neon proof of truth-console compatibility','ci')
  RETURNING id INTO v_truth;
  v_truth_result := public.truth_console_reconcile_claim(v_truth,1);
  IF v_truth_result->>'authorityEffect' IS DISTINCT FROM 'none'
     OR length(v_truth_result->'claim'->>'current_subject_fingerprint') <> 64 THEN
    RAISE EXCEPTION 'truth-console fingerprint repair is nonfunctional';
  END IF;

  SELECT claim_id INTO v_lease FROM public.claim_revenue_strike_customer_send_lease(
    'learning-preview',1::smallint,'founder-preview',repeat('a',64),repeat('b',64),
    repeat('c',64),repeat('d',64),repeat('e',64),
    now()-interval '1 minute','ci',now());
  IF v_lease IS NULL THEN RAISE EXCEPTION 'customer lease claim failed'; END IF;
  IF (SELECT count(*) FROM public.claim_revenue_strike_customer_send_lease(
    'learning-preview',1::smallint,'founder-preview',repeat('a',64),repeat('b',64),
    repeat('c',64),repeat('d',64),repeat('e',64),
    now()-interval '1 minute','ci',now())) <> 0 THEN
    RAISE EXCEPTION 'repeat customer lease was authorized';
  END IF;
  IF (SELECT count(*) FROM public.finalize_revenue_strike_customer_send_lease(
    v_lease,'founder-preview','accepted','preview-provider-id',now())) <> 1 THEN
    RAISE EXCEPTION 'customer send finalization failed';
  END IF;

  IF has_table_privilege('anon','public.learning_records','SELECT')
    OR has_table_privilege('authenticated','public.learning_records','SELECT')
    OR NOT has_table_privilege('service_role','public.learning_records','SELECT')
    OR has_function_privilege('anon','public.learning_progress(uuid,text,text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.learning_progress(uuid,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.claim_revenue_strike_customer_send_lease(text,smallint,text,text,text,text,text,text,timestamptz,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'server-only SQL privilege regression';
  END IF;
END
$learning_proof$;
ROLLBACK;
