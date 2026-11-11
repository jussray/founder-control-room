-- CI-ONLY Neon preview compatibility for a Supabase-specific migration.
-- Executed only on an isolated Neon branch before and after the unchanged SQL
-- migration. NOT a Supabase Auth emulator and NOT proof of live Supabase behavior.
-- Never include this file in production migration history.

CREATE SCHEMA IF NOT EXISTS auth;

DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$bootstrap$;

-- Only the JWT role-claim lookup needed by the existing migration policies.
-- This does not authorize client reads or bypass row-level security.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $role$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$role$;

-- Pre-migration: setup only. Post-migration: check actual effects.
DO $verify$
DECLARE target text;
BEGIN
  IF to_regclass('public.friend_intake_summaries') IS NULL THEN
    RAISE NOTICE 'Neon Auth compatibility prepared; Friend migration not applied yet';
    RETURN;
  END IF;
  FOREACH target IN ARRAY ARRAY[
    'public.friend_intake_summaries',
    'public.friend_intake_feedback',
    'public.friend_inference_reservations'
  ] LOOP
    IF to_regclass(target) IS NULL THEN
      RAISE EXCEPTION 'Friend migration incomplete, missing %', target;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = to_regclass(target)) THEN
      RAISE EXCEPTION 'Friend private table lacks RLS: %', target;
    END IF;
    IF has_table_privilege('anon', target, 'SELECT')
      OR has_table_privilege('authenticated', target, 'SELECT') THEN
      RAISE EXCEPTION 'Friend table accidentally accessible to browser roles: %', target;
    END IF;
  END LOOP;
  IF to_regprocedure('public.reserve_friend_inference_budget(uuid,text,text,numeric,numeric,timestamptz)') IS NULL
    OR to_regprocedure('public.record_friend_intake_completion(text,uuid,text,jsonb,uuid,text,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Friend migration missing server-only atomic RPCs';
  END IF;
  IF has_function_privilege(
      'anon','public.reserve_friend_inference_budget(uuid,text,text,numeric,numeric,timestamptz)','EXECUTE')
    OR has_function_privilege(
      'authenticated','public.reserve_friend_inference_budget(uuid,text,text,numeric,numeric,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Friend budget RPC exposed to browser roles';
  END IF;
  RAISE NOTICE 'Neon Friend schema migration/RLS/browser-grant proof passed';
END;
$verify$;
