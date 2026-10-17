\set ON_ERROR_STOP on

-- Isolated Neon CI proof for the historical Supabase migration.
-- Neon has an independent schema and may lack the Supabase-owned policy.
-- Prove the *actual original SQL* against its authentic prerequisite
-- inside one transaction, then roll back every fixture and policy change.
-- This never represents a live production migration or a deployed release.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
END
$$;

-- Reconstruct the same source-owned table and auth_read=true prerequisite
-- that existed when the recovered migration was originally applied.
\ir ../migrations/20260719213300_reconciliation_events.sql

DO $$
DECLARE observed text;
BEGIN
  SELECT qual INTO observed
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'reconciliation_events'
    AND policyname = 'auth_read'
    AND cmd = 'SELECT'
    AND roles = ARRAY['authenticated']::name[];

  IF observed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Neon preview prerequisite mismatch: expected exact authenticated auth_read=true, received %', observed;
  END IF;
END
$$;

-- Execute the exact migration restored from Supabase's already-applied
-- history; do not substitute a weaker or synthetic policy assertion.
\ir ../migrations/20261013223238_restrict_reconciliation_events_authenticated_read_20261013.sql

DO $$
DECLARE observed text;
DECLARE rls_enabled boolean;
BEGIN
  SELECT qual INTO observed
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'reconciliation_events'
    AND policyname = 'auth_read'
    AND cmd = 'SELECT'
    AND roles = ARRAY['authenticated']::name[];

  IF observed IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Neon preview migration did not restrict auth_read to false: %', observed;
  END IF;

  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE oid = to_regclass('public.reconciliation_events');

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Neon preview migration lost reconciliation_events RLS';
  END IF;
END
$$;

-- Roll back only the isolated preview fixture and exact migration execution.
-- Live Supabase history and policies are never modified by this contract.
ROLLBACK;
