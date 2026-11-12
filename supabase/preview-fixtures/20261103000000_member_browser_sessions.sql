-- Ephemeral Neon preview ONLY. This path is read exclusively by the
-- Neon PR workflow from the PR-scoped preview branch, not by Supabase deploy.
-- Its dummy auth.users schema provides a strictly isolated foreign-key target.
-- The production migration must always execute byte-for-byte unchanged.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);
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
