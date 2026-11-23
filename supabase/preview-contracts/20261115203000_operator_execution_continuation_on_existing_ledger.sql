\set ON_ERROR_STOP on

-- CI-ONLY schema contract for the EXISTING FCR continuity ledger.
-- The Neon project does not contain the canonical Supabase table. Mirror the
-- verified pre-migration columns/types, execute the ORIGINAL migration unchanged,
-- prove indexes + role isolation, then roll back the entire fixture.
-- This is not an authenticated Supabase production migration/readback.
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
END
$$;

-- Column names, types, nullability and id/created_at defaults were checked
-- read-only against the authoritative FCR Supabase project on 2026-11-16.
-- The original ledger's foreign keys are outside this bounded ALTER/INDEX
-- contract; production applicability still requires its own separate gate.
CREATE TABLE public.continuity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_intent_id uuid,
  project_id uuid NOT NULL,
  mission_id uuid,
  subject_fingerprint text NOT NULL,
  proof_cookie text,
  truth_snapshot_id uuid,
  authority_fingerprint text,
  runtime_fingerprint text,
  evidence_fingerprint text,
  valid_until timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX continuity_records_project_created_idx
  ON public.continuity_records (project_id, created_at DESC);

-- Deliberately grant a preview-only client privilege so the migration must
-- REVOKE it to pass the isolation assertion below.
GRANT SELECT, INSERT ON public.continuity_records TO anon, authenticated;

-- Executes exactly the proposed migration. This must never be replaced with
-- copy-pasted ALTER statements or a skip-on-preview shortcut.
\ir ../migrations/20261115203000_operator_execution_continuation_on_existing_ledger.sql

DO $$
DECLARE
  v_project uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_at timestamptz := '2026-11-15T20:30:00Z'::timestamptz;
BEGIN
  IF (SELECT atttypid FROM pg_attribute
      WHERE attrelid = 'public.continuity_records'::regclass
        AND attname = 'task_id' AND NOT attisdropped) IS DISTINCT FROM 'text'::regtype
     OR (SELECT atttypid FROM pg_attribute
      WHERE attrelid = 'public.continuity_records'::regclass
        AND attname = 'execution_state' AND NOT attisdropped) IS DISTINCT FROM 'jsonb'::regtype
     OR (SELECT atttypid FROM pg_attribute
      WHERE attrelid = 'public.continuity_records'::regclass
        AND attname = 'checkpoint_observed_at' AND NOT attisdropped) IS DISTINCT FROM 'timestamptz'::regtype THEN
    RAISE EXCEPTION 'continuation migration columns missing or wrong type';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'continuity_records'
       AND indexname = 'continuity_records_project_task_created_idx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'continuity_records'
       AND indexname = 'continuity_records_task_observation_unique_idx') THEN
    RAISE EXCEPTION 'continuation migration indexes missing';
  END IF;

  INSERT INTO public.continuity_records(project_id, subject_fingerprint, task_id,
    execution_state, checkpoint_observed_at)
  VALUES (v_project, 'preview-only-proof', 'preview-task', '{"contextRefs":[]}'::jsonb, v_at);

  BEGIN
    INSERT INTO public.continuity_records(project_id, subject_fingerprint, task_id,
      execution_state, checkpoint_observed_at)
    VALUES (v_project, 'duplicate-preview-proof', 'preview-task', '{}'::jsonb, v_at);
    RAISE EXCEPTION 'duplicate task observation unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected uniqueness failure for same project/task/observedAt
  END;

  INSERT INTO public.continuity_records(project_id, subject_fingerprint, task_id, checkpoint_observed_at)
  VALUES (v_other, 'other-project-proof', 'preview-task', v_at);

  INSERT INTO public.continuity_records(project_id, subject_fingerprint)
  VALUES (v_project, 'historical-proof-1'), (v_project, 'historical-proof-2');

  IF (SELECT count(*) FROM public.continuity_records
      WHERE project_id = v_project AND task_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'historical proof rows were excluded or modified';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.continuity_records'::regclass)
     OR has_table_privilege('anon', 'public.continuity_records', 'SELECT')
     OR has_table_privilege('anon', 'public.continuity_records', 'INSERT')
     OR has_table_privilege('authenticated', 'public.continuity_records', 'SELECT')
     OR has_table_privilege('authenticated', 'public.continuity_records', 'INSERT') THEN
    RAISE EXCEPTION 'continuity ledger lost RLS/client isolation';
  END IF;
END
$$;

-- Every schema and fixture object created above is test-only.
ROLLBACK;
