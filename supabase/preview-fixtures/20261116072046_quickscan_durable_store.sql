-- Neon-only compatibility for production-recorded QuickScan migration 20261116072046.
-- This is never a Supabase migration. The PR workflow runs this fixture and
-- the exact original SQL atomically against the isolated Neon preview branch.
-- Supabase roles exist in production, but may be absent on plain Neon.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
    END IF;
  END LOOP;
END;
$$;
