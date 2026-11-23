\set ON_ERROR_STOP on

-- CI-only transactional proof contract for
-- 20260919223000_revoke_server_only_ledger_client_grants.sql.
-- It reconstructs only the source-owned prerequisite schema required to prove
-- the grant transition, then rolls the entire fixture back.

BEGIN;

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

\ir ../migrations/20260802193000_hair_commerce_receipts.sql
\ir ../migrations/20260811004830_founder_signal_review_email_receipts.sql
\ir ../migrations/20260812004000_founder_signal_review_execution_bridge.sql

-- Reconstruct the exact latent privilege debt the forward migration closes.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.founder_signal_review_email_receipts
  TO PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.founder_signal_review_contexts
  TO PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.founder_signal_review_command_dispatches
  TO PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.hair_commerce_receipts
  TO PUBLIC, anon, authenticated;

\ir ../migrations/20260919223000_revoke_server_only_ledger_client_grants.sql

DO $$
DECLARE
  table_name TEXT;
  client_role TEXT;
  privilege_name TEXT;
  qualified_table TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'founder_signal_review_email_receipts',
    'founder_signal_review_contexts',
    'founder_signal_review_command_dispatches',
    'hair_commerce_receipts'
  ]
  LOOP
    qualified_table := format('public.%I', table_name);

    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]
      LOOP
        IF has_table_privilege(client_role, qualified_table, privilege_name) THEN
          RAISE EXCEPTION
            'client privilege survived hardening: role=% table=% privilege=%',
            client_role,
            qualified_table,
            privilege_name;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      IF NOT has_table_privilege('service_role', qualified_table, privilege_name) THEN
        RAISE EXCEPTION
          'service_role lost required CRUD privilege: table=% privilege=%',
          qualified_table,
          privilege_name;
      END IF;
    END LOOP;

    SELECT relrowsecurity
      INTO rls_enabled
      FROM pg_class
      WHERE oid = to_regclass(qualified_table);

    IF rls_enabled IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'RLS is not enabled after hardening: table=%', qualified_table;
    END IF;
  END LOOP;
END
$$;

ROLLBACK;
