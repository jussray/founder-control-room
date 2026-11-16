\set ON_ERROR_STOP on

-- CI-only real-Postgres proof contract for
-- 20261116010000_webchat_human_handoffs.sql.
-- Neon previews lack Supabase's built-in roles, so create them, apply the real
-- migration, then prove the access boundary and the one-open-handoff rule.

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
COMMIT;

-- The preview branch persists across pushes and CI re-runs this contract on
-- each new head after the migration's receipt is recorded. Apply the real
-- migration only when the table is absent; the assertions below run every time.
SELECT to_regclass('public.webchat_human_handoffs') IS NULL AS webchat_handoffs_needs_migration \gset
\if :webchat_handoffs_needs_migration
\ir ../migrations/20261116010000_webchat_human_handoffs.sql
\endif

DO $$
DECLARE
  rls_enabled boolean;
  key_a text := 'webchat-handoff:' || repeat('a', 64);
  key_b text := 'webchat-handoff:' || repeat('b', 64);
  key_c text := 'webchat-handoff:' || repeat('c', 64);
  rejected boolean;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class WHERE oid = to_regclass('public.webchat_human_handoffs');
  IF rls_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'webchat_human_handoffs must have RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.webchat_human_handoffs', 'SELECT')
     OR has_table_privilege('anon', 'public.webchat_human_handoffs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.webchat_human_handoffs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.webchat_human_handoffs', 'INSERT') THEN
    RAISE EXCEPTION 'anon/authenticated must have no access to webchat_human_handoffs';
  END IF;
  IF NOT (has_table_privilege('service_role', 'public.webchat_human_handoffs', 'SELECT')
          AND has_table_privilege('service_role', 'public.webchat_human_handoffs', 'INSERT')
          AND has_table_privilege('service_role', 'public.webchat_human_handoffs', 'UPDATE')) THEN
    RAISE EXCEPTION 'service_role must be able to select, insert and update';
  END IF;
  IF has_table_privilege('service_role', 'public.webchat_human_handoffs', 'DELETE') THEN
    RAISE EXCEPTION 'service_role must not delete handoff rows';
  END IF;

  INSERT INTO public.webchat_human_handoffs
    (idempotency_key, project_id, brand_id, conversation_id, visitor_hash, source_event_id, state, requested_at)
  VALUES (key_a, 'founder-control-room', 'founder-control-room', 'conversation:abc12345',
          'anon:' || repeat('1', 64), repeat('2', 64), 'pending_human', now());

  rejected := false;
  BEGIN
    INSERT INTO public.webchat_human_handoffs
      (idempotency_key, project_id, brand_id, conversation_id, visitor_hash, source_event_id, state, requested_at)
    VALUES (key_b, 'founder-control-room', 'founder-control-room', 'conversation:abc12345',
            'anon:' || repeat('1', 64), repeat('3', 64), 'pending_human', now());
  EXCEPTION WHEN unique_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'a second open handoff for the same conversation must be rejected';
  END IF;

  UPDATE public.webchat_human_handoffs
     SET state = 'released', released_at = now(), released_by = 'founder-user-1'
   WHERE idempotency_key = key_a;
  INSERT INTO public.webchat_human_handoffs
    (idempotency_key, project_id, brand_id, conversation_id, visitor_hash, source_event_id, state, requested_at)
  VALUES (key_b, 'founder-control-room', 'founder-control-room', 'conversation:abc12345',
          'anon:' || repeat('1', 64), repeat('3', 64), 'pending_human', now());

  rejected := false;
  BEGIN
    INSERT INTO public.webchat_human_handoffs
      (idempotency_key, project_id, brand_id, conversation_id, visitor_hash, source_event_id, state, requested_at)
    VALUES (key_c, 'Founder-Control-Room', 'founder-control-room', 'conversation:xyz12345',
            'anon:' || repeat('1', 64), repeat('4', 64), 'pending_human', now());
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'mixed-case project ids must be rejected';
  END IF;

  DELETE FROM public.webchat_human_handoffs WHERE idempotency_key IN (key_a, key_b);
END
$$;
