\set ON_ERROR_STOP on

-- CI-ONLY Neon preview contract: reconstruct minimal Supabase prerequisites,
-- run the exact append-only production migration, verify default-deny and
-- service-role grants, then roll back. Never writes the real Supabase database.
BEGIN;

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

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid primary key
);

\ir ../migrations/20261107164425_fcr_public_tenant_boundaries.sql

DO $$
DECLARE
  rel_name text;
  enabled boolean;
  found_rows bigint;
BEGIN
  FOREACH rel_name IN ARRAY ARRAY[
    'fcr_public_tenants',
    'fcr_public_memberships',
    'fcr_public_projects'
  ]
  LOOP
    SELECT relrowsecurity INTO enabled
      FROM pg_class
     WHERE oid = format('public.%I', rel_name)::regclass;
    IF enabled IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Missing RLS for %', rel_name;
    END IF;

    IF has_table_privilege('anon', format('public.%I', rel_name), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', rel_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', rel_name), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', rel_name), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', rel_name), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', rel_name), 'DELETE') THEN
      RAISE EXCEPTION 'Client access exposed on %', rel_name;
    END IF;

    IF NOT has_table_privilege('service_role', format('public.%I', rel_name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', rel_name), 'INSERT') THEN
      RAISE EXCEPTION 'Backend permission missing on %', rel_name;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', rel_name) INTO found_rows;
    IF found_rows <> 0 THEN
      RAISE EXCEPTION 'Nonempty public tenant table % in blank-state migration proof', rel_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = rel_name
        AND roles = ARRAY['service_role']::name[]
    ) THEN
      RAISE EXCEPTION 'Service-only tenant policy missing on %', rel_name;
    END IF;
  END LOOP;
END
$$;

ROLLBACK;
