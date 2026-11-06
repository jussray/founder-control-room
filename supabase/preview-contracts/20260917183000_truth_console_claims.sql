\set ON_ERROR_STOP on

-- CI-only transactional proof contract for
-- 20260917183000_truth_console_claims.sql.
-- Neon PR branches do not replay FCR's full historical schema, so reconstruct
-- only the authoritative predecessor tables/roles this migration depends on,
-- execute the unchanged migration, exercise its three proof transitions, then
-- roll back every fixture and migration object created by this contract.

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

\ir ../migrations/20260917183000_truth_console_claims.sql

DO $$
DECLARE
  v_project uuid := gen_random_uuid();
  v_claim uuid;
  v_evidence uuid;
  v_attack uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.projects(id, slug, name)
  VALUES (v_project, 'truth-console-preview', 'Truth Console Preview');

  INSERT INTO public.truth_claims(project_id, statement, created_by)
  VALUES (v_project, 'Preview contract claim', 'ci-preview')
  RETURNING id INTO v_claim;

  v_result := public.truth_console_attach_evidence(
    v_claim,
    'manual-observation',
    'pass',
    'supports',
    'founder',
    'preview://truth-console-evidence'
  );

  SELECT evidence_id INTO v_evidence
  FROM public.truth_claim_evidence
  WHERE claim_id = v_claim;

  IF v_evidence IS NULL OR v_result->>'authorityEffect' IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'truth console evidence transition did not preserve non-authorizing receipt semantics';
  END IF;

  v_result := public.truth_console_reconcile_claim(v_claim, 2);
  IF v_result->>'authorityEffect' IS DISTINCT FROM 'none'
     OR v_result->'continuity'->>'state' IS DISTINCT FROM 'current' THEN
    RAISE EXCEPTION 'truth console reconciliation did not produce current non-authorizing continuity';
  END IF;

  INSERT INTO public.truth_attacks(
    claim_id,
    project_id,
    attack_type,
    challenge,
    severity,
    created_by
  ) VALUES (
    v_claim,
    v_project,
    'version',
    'Preview contract challenge',
    'medium',
    'ci-preview'
  )
  RETURNING id INTO v_attack;

  v_result := public.truth_console_resolve_attack(
    v_attack,
    'Resolved with evidence already linked to the challenged claim.',
    v_evidence
  );

  IF v_result->>'cookieState' IS DISTINCT FROM 'stale'
     OR v_result->>'authorityEffect' IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'truth console attack resolution did not stale continuity without authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.continuity_records
    WHERE project_id = v_project
      AND invalidation_reason = 'attack_resolution_changed_truth'
      AND invalidated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'truth console attack resolution did not persist exact continuity invalidation';
  END IF;
END
$$;

DO $$
DECLARE
  rel text;
  rls_enabled boolean;
BEGIN
  FOREACH rel IN ARRAY ARRAY['truth_claims', 'truth_claim_evidence', 'truth_attacks']
  LOOP
    SELECT c.relrowsecurity
      INTO rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = rel;

    IF rls_enabled IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RLS missing on %', rel;
    END IF;

    IF NOT has_table_privilege('service_role', format('public.%I', rel), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', rel), 'INSERT') THEN
      RAISE EXCEPTION 'service_role lost required truth-console table authority on %', rel;
    END IF;

    IF has_table_privilege('anon', format('public.%I', rel), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', rel), 'SELECT') THEN
      RAISE EXCEPTION 'client read privilege leaked on %', rel;
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'service_role',
    'public.truth_console_attach_evidence(uuid,text,text,text,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.truth_console_reconcile_claim(uuid,bigint)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.truth_console_resolve_attack(uuid,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role lost required truth-console function authority';
  END IF;
END
$$;

ROLLBACK;
