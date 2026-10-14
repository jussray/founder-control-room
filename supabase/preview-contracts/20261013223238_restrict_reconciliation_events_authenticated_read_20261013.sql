-- Neon preview contract for the production-recorded FCR RLS reconciliation.
-- Neon does not inherit the Supabase schema. Run the real historical and
-- forward migrations against disposable PostgreSQL state, then ROLLBACK.
-- This verifies the migration's preconditions and effect; it does not
-- substitute for the separately observed production Supabase policy.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

\ir ../migrations/20260719213300_reconciliation_events.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_events'
      AND policyname = 'auth_read'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'SELECT'
      AND qual = 'true'
  ) THEN
    RAISE EXCEPTION 'Neon test setup failed: the real historical migration did not create the expected unrestricted read policy';
  END IF;
END $$;

\ir ../migrations/20261013223238_restrict_reconciliation_events_authenticated_read_20261013.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'reconciliation_events'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Neon test failed: reconciliation_events must retain row-level security';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_events'
      AND policyname = 'auth_read'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'SELECT'
      AND qual = 'false'
  ) THEN
    RAISE EXCEPTION 'Neon test failed: authenticated read remains permitted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_events'
      AND policyname = 'service_insert'
      AND roles = ARRAY['service_role']::name[]
      AND cmd = 'INSERT'
      AND with_check = 'true'
  ) THEN
    RAISE EXCEPTION 'Neon test failed: service-role insert policy was modified';
  END IF;
END $$;

ROLLBACK;
