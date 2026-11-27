\set ON_ERROR_STOP on
-- Neon preview fixture for the unmodified canonical Supabase migration.
-- The temporary stand-in roles and all table rows roll back; no live grants.
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
END;
$$;

\ir ../migrations/20261113235900_canon_knowledge_events.sql

DO $$
DECLARE
  rls_enabled boolean;
  mutation_blocked boolean := false;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class WHERE oid = 'public.canon_knowledge_events'::regclass;
  IF rls_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'CI_CANON_RLS_NOT_ENABLED';
  END IF;
  IF has_table_privilege('anon', 'public.canon_knowledge_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.canon_knowledge_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.canon_knowledge_events', 'SELECT') THEN
    RAISE EXCEPTION 'CI_CANON_PUBLIC_ROLE_LEAK';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.canon_knowledge_events', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.canon_knowledge_events', 'INSERT') THEN
    RAISE EXCEPTION 'CI_CANON_SERVICE_ROLE_GRANT_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.canon_knowledge_events'::regclass
      AND tgname = 'canon_knowledge_immutable' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'CI_CANON_IMMUTABILITY_TRIGGER_MISSING';
  END IF;
  INSERT INTO public.canon_knowledge_events
    (project, claim_key, sequence, contract, digest, observed_at,
     receipt_id, authority, source_ref, verifier_id, action, event_hash)
  VALUES
    ('ci-project','ci-claim',1,'fcr/canon-knowledge@v1',repeat('a',64),now(),
     'ci-receipt','repository','ci-source','ci-verifier','established',repeat('b',64));
  BEGIN
    UPDATE public.canon_knowledge_events SET receipt_id = 'tampered'
    WHERE project = 'ci-project';
  EXCEPTION WHEN OTHERS THEN
    mutation_blocked := SQLERRM = 'CANON_APPEND_ONLY';
  END;
  IF NOT mutation_blocked THEN
    RAISE EXCEPTION 'CI_CANON_MUTATION_NOT_BLOCKED';
  END IF;
END;
$$;

ROLLBACK;
