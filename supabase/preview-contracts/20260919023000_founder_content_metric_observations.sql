\set ON_ERROR_STOP on

-- CI-only real-Postgres proof contract for
-- 20260919023000_founder_content_metric_observations.sql.
-- Reconstruct only the source-owned prerequisite tables/roles that the migration
-- depends on, apply the real migration, exercise the service-role RPC, and keep
-- every authority boundary observable.

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

CREATE TABLE IF NOT EXISTS public.founder_content_posts (
  post_id uuid PRIMARY KEY,
  founder_user_id text NOT NULL,
  provider text NOT NULL,
  account_id text NOT NULL,
  content_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.founder_content_post_events (
  event_id bigserial PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.founder_content_posts(post_id),
  founder_user_id text NOT NULL,
  event_type text NOT NULL,
  actor text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL
);

COMMIT;

\ir ../migrations/20260919023000_founder_content_metric_observations.sql

DO $$
DECLARE
  rls_enabled boolean;
  function_security_definer boolean;
  function_search_path text[];
BEGIN
  SELECT relrowsecurity
    INTO rls_enabled
    FROM pg_class
   WHERE oid = to_regclass('public.founder_content_metric_observations');

  IF rls_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'metric observation table must have RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.founder_content_metric_observations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.founder_content_metric_observations', 'SELECT')
     OR has_table_privilege('anon', 'public.founder_content_metric_observations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.founder_content_metric_observations', 'INSERT') THEN
    RAISE EXCEPTION 'browser/client role retained metric table privilege';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.founder_content_metric_observations', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost required metric read privilege';
  END IF;

  IF has_table_privilege('service_role', 'public.founder_content_metric_observations', 'INSERT')
     OR has_table_privilege('service_role', 'public.founder_content_metric_observations', 'UPDATE')
     OR has_table_privilege('service_role', 'public.founder_content_metric_observations', 'DELETE') THEN
    RAISE EXCEPTION 'service_role must not bypass the atomic metric ingestion RPC';
  END IF;

  IF has_function_privilege('anon', 'public.ingest_founder_content_metric_observations(text,uuid,jsonb,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ingest_founder_content_metric_observations(text,uuid,jsonb,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser/client role retained metric ingestion execute privilege';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.ingest_founder_content_metric_observations(text,uuid,jsonb,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost metric ingestion execute privilege';
  END IF;

  SELECT p.prosecdef, p.proconfig
    INTO function_security_definer, function_search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'ingest_founder_content_metric_observations'
     AND pg_get_function_identity_arguments(p.oid) = 'p_founder_user_id text, p_post_id uuid, p_observations jsonb, p_import_fingerprint text, p_imported_at timestamp with time zone';

  IF function_security_definer IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'metric ingestion RPC must remain SECURITY DEFINER while direct table mutation is revoked';
  END IF;
  IF function_search_path IS NULL OR NOT ('search_path=pg_catalog' = ANY(function_search_path)) THEN
    RAISE EXCEPTION 'metric ingestion RPC must pin search_path to pg_catalog';
  END IF;
END
$$;

-- The Neon preview branch is intentionally reusable across synchronize events.
-- Clean only this contract's reserved fixture identity so a prior failed proof
-- cannot create a false red or donate state to the successor proof.
DELETE FROM public.founder_content_metric_observations
 WHERE post_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM public.founder_content_post_events
 WHERE post_id = '11111111-1111-4111-8111-111111111111';
DELETE FROM public.founder_content_posts
 WHERE post_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.founder_content_posts (
  post_id, founder_user_id, provider, account_id, content_hash
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'founder-preview',
  'linkedin',
  'acct-preview',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);

SET ROLE service_role;

SELECT public.ingest_founder_content_metric_observations(
  'founder-preview',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_array(jsonb_build_object(
    'observationId', 'obs-preview',
    'contentFingerprint', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'provider', 'linkedin',
    'accountId', 'acct-preview',
    'pageId', 'page-preview',
    'audienceSegment', 'founders',
    'metricName', 'impressions',
    'metricValue', 42,
    'unit', 'count',
    'windowStart', '2026-10-01T00:00:00.000Z',
    'windowEnd', '2026-10-07T00:00:00.000Z',
    'observedAt', '2026-10-08T00:00:00.000Z',
    'evidenceState', 'OBSERVED',
    'provenance', jsonb_build_object(
      'source', 'ci_safe_fixture',
      'sourceRef', 'fixture:preview',
      'rowFingerprint', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    )
  )),
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '2026-10-08T01:00:00.000Z'
) AS first_receipt;

SELECT public.ingest_founder_content_metric_observations(
  'founder-preview',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_array(jsonb_build_object(
    'observationId', 'obs-preview',
    'contentFingerprint', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'provider', 'linkedin',
    'accountId', 'acct-preview',
    'pageId', 'page-preview',
    'audienceSegment', 'founders',
    'metricName', 'impressions',
    'metricValue', 42,
    'unit', 'count',
    'windowStart', '2026-10-01T00:00:00.000Z',
    'windowEnd', '2026-10-07T00:00:00.000Z',
    'observedAt', '2026-10-08T00:00:00.000Z',
    'evidenceState', 'OBSERVED',
    'provenance', jsonb_build_object(
      'source', 'ci_safe_fixture',
      'sourceRef', 'fixture:preview',
      'rowFingerprint', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    )
  )),
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '2026-10-08T01:00:00.000Z'
) AS retry_receipt;

RESET ROLE;

DO $$
DECLARE
  metric_count integer;
  event_count integer;
  conflict_rejected boolean := false;
BEGIN
  SELECT count(*)::integer
    INTO metric_count
    FROM public.founder_content_metric_observations
   WHERE post_id = '11111111-1111-4111-8111-111111111111'
     AND observation_id = 'obs-preview';

  IF metric_count <> 1 THEN
    RAISE EXCEPTION 'exact retry must remain idempotent; metric_count=%', metric_count;
  END IF;

  SELECT count(*)::integer
    INTO event_count
    FROM public.founder_content_post_events
   WHERE post_id = '11111111-1111-4111-8111-111111111111'
     AND event_type = 'metrics_csv_imported';

  IF event_count <> 1 THEN
    RAISE EXCEPTION 'exact retry must not duplicate the lifecycle receipt; event_count=%', event_count;
  END IF;

  BEGIN
    PERFORM public.ingest_founder_content_metric_observations(
      'founder-preview',
      '11111111-1111-4111-8111-111111111111',
      jsonb_build_array(jsonb_build_object(
        'observationId', 'obs-preview',
        'contentFingerprint', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'provider', 'linkedin',
        'accountId', 'acct-preview',
        'pageId', 'page-preview',
        'audienceSegment', 'founders',
        'metricName', 'impressions',
        'metricValue', 43,
        'unit', 'count',
        'windowStart', '2026-10-01T00:00:00.000Z',
        'windowEnd', '2026-10-07T00:00:00.000Z',
        'observedAt', '2026-10-08T00:00:00.000Z',
        'evidenceState', 'OBSERVED',
        'provenance', jsonb_build_object(
          'source', 'ci_safe_fixture',
          'sourceRef', 'fixture:preview',
          'rowFingerprint', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
        )
      )),
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      '2026-10-08T02:00:00.000Z'
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF position('FOUNDER_CONTENT_METRICS_CONFLICT' in SQLERRM) > 0 THEN
        conflict_rejected := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF conflict_rejected IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'conflicting metric evidence was not rejected';
  END IF;
END
$$;
