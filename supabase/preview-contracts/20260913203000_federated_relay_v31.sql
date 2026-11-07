\set ON_ERROR_STOP on

-- CI-only compatibility contract for the disposable Neon preview.
-- Production Supabase already supplies these NOLOGIN roles. Plain Neon does
-- not, so create only the role identities required to execute the exact,
-- unchanged production migration and its grant/revoke statements.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN';
  END IF;
END
$$;

\ir ../migrations/20260913203000_federated_relay_v31.sql

DO $$
BEGIN
  IF to_regclass('public.federated_relay_v31_messages') IS NULL
     OR to_regclass('public.federated_relay_v31_outbox') IS NULL
     OR to_regclass('public.federated_relay_v31_public_keys') IS NULL THEN
    RAISE EXCEPTION 'relay_v31_preview_schema_missing';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.federated_relay_v31_messages', 'SELECT') THEN
    RAISE EXCEPTION 'relay_v31_preview_service_role_read_missing';
  END IF;

  IF has_table_privilege('anon', 'public.federated_relay_v31_messages', 'SELECT')
     OR has_table_privilege('authenticated', 'public.federated_relay_v31_messages', 'SELECT') THEN
    RAISE EXCEPTION 'relay_v31_preview_client_privilege_survived';
  END IF;
END
$$;
