\set ON_ERROR_STOP on

-- CI-only behavioral proof for the already-applied Supabase migration.
-- The Neon preview branch may not contain the original FCR auth_read policy.
-- Reconstruct its exact precondition, execute the unchanged source migration,
-- assert the authenticated SELECT policy becomes deny-all, then roll back.
-- No real data, project permissions, or persistent preview schema are changed.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.reconciliation_events (
  id BIGINT PRIMARY KEY
);
ALTER TABLE public.reconciliation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read ON public.reconciliation_events
  FOR SELECT TO authenticated USING (true);

\ir ../migrations/20261013223238_restrict_reconciliation_events_authenticated_read_20261013.sql

DO $$
DECLARE observed_policy TEXT;
BEGIN
  SELECT qual INTO observed_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'reconciliation_events'
    AND policyname = 'auth_read'
    AND cmd = 'SELECT'
    AND roles = ARRAY['authenticated']::name[];

  IF observed_policy IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Authenticated reconciliation event reads must remain blocked; received %', observed_policy;
  END IF;
END
$$;

ROLLBACK;
