-- Neon PR preview only. Never execute against production Supabase.
-- Supply the minimum Supabase auth compatibility surface for unchanged historical SQL.
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
    EXECUTE $fn$ CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid' $fn$;
  END IF;
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    EXECUTE $fn$ CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS 'SELECT coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb, ''{}''::jsonb)' $fn$;
  END IF;
END;
$$;
