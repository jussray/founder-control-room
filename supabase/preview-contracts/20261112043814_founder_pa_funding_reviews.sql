\set ON_ERROR_STOP on

-- CI-only preview contract for the original Supabase funding migration.
-- Neon is plain Postgres and does not supply auth.users or Supabase roles.
-- Reconstruct only those prerequisites inside a rolled-back transaction.
-- Never connect this contract to the real Supabase project or production Neon.
BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

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

-- Run the unchanged source migration, not a CI approximation of it.
\ir ../migrations/20261112043814_founder_pa_funding_reviews.sql

DO $$
DECLARE
  target regclass := to_regclass('public.founder_pa_funding_reviews');
  privilege text;
  test_user uuid := '00000000-0000-4000-8000-000000000001';
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'FUNDING_PREVIEW_MISSING_TABLE';
  END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = target) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FUNDING_PREVIEW_RLS_DISABLED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'founder_pa_funding_reviews'
  ) THEN
    RAISE EXCEPTION 'FUNDING_PREVIEW_UNEXPECTED_CLIENT_POLICY';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = target AND contype = 'f'
      AND confrelid = 'auth.users'::regclass
  ) THEN
    RAISE EXCEPTION 'FUNDING_PREVIEW_MISSING_AUTH_USER_FK';
  END IF;

  FOREACH privilege IN ARRAY ARRAY[
    'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
  ] LOOP
    IF has_table_privilege('anon', target, privilege)
       OR has_table_privilege('authenticated', target, privilege) THEN
      RAISE EXCEPTION 'FUNDING_PREVIEW_CLIENT_PRIVILEGE: %', privilege;
    END IF;
    IF has_table_privilege('service_role', target, privilege)
       IS DISTINCT FROM (privilege IN ('SELECT','INSERT','UPDATE')) THEN
      RAISE EXCEPTION 'FUNDING_PREVIEW_SERVICE_PRIVILEGE: %', privilege;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.founder_pa_funding_reviews) <> 0 THEN
    RAISE EXCEPTION 'FUNDING_PREVIEW_UNEXPECTED_EXISTING_DATA';
  END IF;

  INSERT INTO auth.users(id) VALUES (test_user);
  INSERT INTO public.founder_pa_funding_reviews(
    founder_user_id, opportunity_id, stage, checks, evidence_note
  ) VALUES (test_user, 'cea-growth', 'REVIEW', '{"0":true}'::jsonb, 'preview-only');

  IF NOT EXISTS (
    SELECT 1 FROM public.founder_pa_funding_reviews
    WHERE founder_user_id = test_user AND opportunity_id = 'cea-growth'
      AND stage = 'REVIEW' AND checks ->> '0' = 'true'
  ) THEN
    RAISE EXCEPTION 'FUNDING_PREVIEW_VALID_RECORD_NOT_PERSISTED';
  END IF;

  BEGIN
    INSERT INTO public.founder_pa_funding_reviews(
      founder_user_id, opportunity_id, stage
    ) VALUES (test_user, 'kiz', 'APPLY');
    RAISE EXCEPTION 'FUNDING_PREVIEW_APPLY_STAGE_NOT_BLOCKED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.founder_pa_funding_reviews(
      founder_user_id, opportunity_id, stage
    ) VALUES (test_user, 'unauthorized-program', 'REVIEW');
    RAISE EXCEPTION 'FUNDING_PREVIEW_UNKNOWN_PROGRAM_NOT_BLOCKED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.founder_pa_funding_reviews(
      founder_user_id, opportunity_id, stage, evidence_note
    ) VALUES (test_user, 'kiz', 'REVIEW', repeat('x', 1501));
    RAISE EXCEPTION 'FUNDING_PREVIEW_NOTE_LIMIT_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

-- No preview user, role, table or migration fixture survives this check.
ROLLBACK;
