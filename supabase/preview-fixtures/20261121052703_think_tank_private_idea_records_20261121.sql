-- Ephemeral Neon preview ONLY; not a production migration or auth implementation.
-- Minimal Supabase-compatible dependencies for executing the unchanged vault SQL.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
    END IF;
  END LOOP;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE $sql$CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'$sql$;
  END IF;
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    EXECUTE $sql$CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
      AS 'SELECT COALESCE(NULLIF(current_setting(''request.jwt.claims'', true), ''''), ''{}'')::jsonb'$sql$;
  END IF;
END;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated;
