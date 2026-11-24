\set ON_ERROR_STOP on

-- Neon is plain Postgres, not Supabase; its preview lacks the Supabase
-- anon/authenticated/service_role roles used by the *already applied*
-- production migration. Create NOLOGIN identities on the isolated Neon PR
-- preview only, then execute the ORIGINAL source migration unmodified.
-- The preview is ephemeral and contains no live Supabase user data.
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

\ir ../migrations/20261024231659_sauce_source_guard_minimal_evidence_boundary.sql

-- Verify provider-neutral properties of the *applied original migration*.
-- This is preview catalog proof only; live Supabase state is separate.
DO $$
DECLARE
  target regclass := to_regclass('public.guard_source_verification_receipts');
  role_name text;
  privilege_name text;
  expected_service boolean;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'GUARD_RECEIPT_PREVIEW_MISSING_TABLE';
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE oid = target) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'GUARD_RECEIPT_PREVIEW_RLS_DISABLED';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public'
               AND tablename = 'guard_source_verification_receipts') THEN
    RAISE EXCEPTION 'GUARD_RECEIPT_PREVIEW_UNEXPECTED_RLS_POLICY';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] LOOP
      IF has_table_privilege(role_name, target, privilege_name) THEN
        RAISE EXCEPTION 'GUARD_RECEIPT_PREVIEW_CLIENT_PRIVILEGE: %, %', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH privilege_name IN ARRAY ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ] LOOP
    expected_service := privilege_name IN ('SELECT', 'INSERT');
    IF has_table_privilege('service_role', target, privilege_name) IS DISTINCT FROM expected_service THEN
      RAISE EXCEPTION 'GUARD_RECEIPT_PREVIEW_SERVICE_PRIVILEGE: %, expected %',
        privilege_name, expected_service;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.guard_source_verification_receipts) <> 0 THEN
    RAISE EXCEPTION 'GUARD_RECEIPT_PREVIEW_UNEXPECTED_ROWS';
  END IF;
END
$$;
