-- Recheck real Neon catalog state before accepting a matching migration checksum.
-- A checksum receipt alone does not prove that a prior preview contract committed.
-- This is strictly read-only and must also pass after a fresh preview migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'reconciliation_events'
      AND c.relkind = 'r'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FCR preview postcondition failed: RLS-protected reconciliation_events table is missing';
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
    RAISE EXCEPTION 'FCR preview postcondition failed: authenticated SELECT is not denied';
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
    RAISE EXCEPTION 'FCR preview postcondition failed: service-role INSERT policy was not preserved';
  END IF;
END $$;
