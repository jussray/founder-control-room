\set ON_ERROR_STOP on

-- CI-only Neon structural/integration proof for the actual FCR Supabase migration.
-- FCR's canonical content approvals and lifecycle tables live in Supabase, not
-- in the separate Neon project's parent database. These two test prerequisites
-- recreate ONLY their source-verified primary-key contracts on an expiring
-- Neon PR branch. They never issue publication authority and must never be
-- deployed or treated as a production Supabase migration.
-- The real migration is executed verbatim with \ir below. This proof verifies
-- PostgreSQL DDL, foreign keys, RLS, grants, editorial approval guards,
-- append-only receipts, and unknown-is-not-zero metrics. It does NOT prove
-- the full Supabase auth runtime or production deployment.

BEGIN;

DO $roles$
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
$roles$;

-- The policy uses Supabase's auth.role(), which Neon does not ship. Provide
-- a role-only compatibility function for this isolated PostgreSQL proof.
-- No claims about Supabase JWT authentication are made by this function.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $function$ SELECT current_user::text $function$;

CREATE TABLE IF NOT EXISTS public.founder_content_approvals (
  approval_id text PRIMARY KEY
    CHECK (approval_id ~ '^[a-z0-9][a-z0-9._:-]{0,119}$')
);

CREATE TABLE IF NOT EXISTS public.founder_content_posts (
  post_id uuid PRIMARY KEY
);

-- These are actual authoritatively verified FK identity types from the live
-- FCR Supabase schema. Never create a second approvals ledger in production.
DO $prerequisites$
BEGIN
  IF (SELECT format_type(a.atttypid, a.atttypmod)
      FROM pg_attribute a
      WHERE a.attrelid = 'public.founder_content_approvals'::regclass
        AND a.attname = 'approval_id') IS DISTINCT FROM 'text'
     OR (SELECT format_type(a.atttypid, a.atttypmod)
         FROM pg_attribute a
         WHERE a.attrelid = 'public.founder_content_posts'::regclass
           AND a.attname = 'post_id') IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Canonical founder content prerequisite PK types mismatched';
  END IF;
END
$prerequisites$;

COMMIT;

-- Apply the ACTUAL candidate migration; never replace it with a stub.
\ir ../migrations/20261104022801_content_system_data_layer.sql

-- Behavioral proof leaves no fabricated content/publication rows on the
-- reused preview branch; a failed assertion fails CI and rolls back test rows.
BEGIN;

DO $proof$
DECLARE
  item record;
  first_receipt uuid;
  rejected boolean := false;
  table_name text;
  expected_table text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['content_queue','publication_receipts','post_metrics'] LOOP
    SELECT c.relrowsecurity INTO STRICT item
    FROM pg_class c
    WHERE c.oid = to_regclass('public.' || table_name);
    IF item.relrowsecurity IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RLS not enabled for %', table_name;
    END IF;
    IF has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
       OR has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || table_name, 'INSERT') THEN
      RAISE EXCEPTION 'Client-role privilege leaked on %', table_name;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role','public.content_queue','INSERT')
     OR NOT has_table_privilege('service_role','public.content_queue','UPDATE')
     OR NOT has_table_privilege('service_role','public.publication_receipts','INSERT')
     OR NOT has_table_privilege('service_role','public.post_metrics','INSERT') THEN
    RAISE EXCEPTION 'Trusted writer has lost a required permission';
  END IF;
  IF has_table_privilege('service_role','public.publication_receipts','UPDATE')
     OR has_table_privilege('service_role','public.publication_receipts','DELETE')
     OR has_table_privilege('service_role','public.post_metrics','UPDATE')
     OR has_table_privilege('service_role','public.post_metrics','DELETE') THEN
    RAISE EXCEPTION 'Append-only receipts/metrics unexpectedly mutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.content_queue'::regclass
      AND t.tgname = 'content_queue_approval_binding_guard'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'Exact-content/media approval binding trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.content_queue'::regclass
      AND c.confrelid = 'public.founder_content_approvals'::regclass
      AND c.contype = 'f'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.publication_receipts'::regclass
      AND c.confrelid = 'public.founder_content_posts'::regclass
      AND c.contype = 'f'
  ) THEN
    RAISE EXCEPTION 'Canonical approval/post foreign-key boundaries missing';
  END IF;

  -- No reviewed media hash means approval cannot be represented.
  BEGIN
    INSERT INTO public.content_queue (
      id, project, account, caption, fingerprint, content_hash,
      status, approved_at, approved_by, approval_expires_at
    ) VALUES (
      'ci-preview-content-invalid', 'ci-preview', 'ci-preview', 'unreviewed',
      'fingerprint-ci-preview', repeat('a',64),
      'APPROVED', now(), 'founder-preview', now() + interval '1 hour'
    );
    RAISE EXCEPTION 'Unreviewed media was accepted as APPROVED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.content_queue (
    id, project, account, caption, fingerprint, content_hash,
    media_path, media_hash, media_reviewed_at,
    status, approved_at, approved_by, approval_expires_at
  ) VALUES (
    'ci-preview-content-valid', 'ci-preview', 'ci-preview',
    'content the founder reviewed', 'fingerprint-ci-preview',
    repeat('a',64), 'assets/ci-preview.png', repeat('b',64), now(),
    'APPROVED', now(), 'founder-preview', now() + interval '1 hour'
  );

  UPDATE public.content_queue
     SET caption = 'modified after approval'
   WHERE id = 'ci-preview-content-valid';
  SELECT status, approved_at, approved_by, approval_expires_at,
         founder_approval_id INTO item
    FROM public.content_queue WHERE id = 'ci-preview-content-valid';
  IF item.status <> 'HELD' OR item.approved_at IS NOT NULL
     OR item.approved_by IS NOT NULL
     OR item.approval_expires_at IS NOT NULL
     OR item.founder_approval_id IS NOT NULL THEN
    RAISE EXCEPTION 'Editing approved content did not revoke approval';
  END IF;

  UPDATE public.content_queue SET media_hash = repeat('c',64)
   WHERE id = 'ci-preview-content-valid';
  IF EXISTS (
    SELECT 1 FROM public.content_queue
    WHERE id = 'ci-preview-content-valid' AND media_reviewed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Changed media retained old review evidence';
  END IF;

  INSERT INTO public.publication_receipts (
    queue_id, platform, account, native_post_id, content_hash, published_at
  ) VALUES (
    'ci-preview-content-valid','instagram','ci-preview','ci-native-1',
    repeat('a',64),now()
  ) RETURNING id INTO first_receipt;

  BEGIN
    INSERT INTO public.publication_receipts (
      queue_id, platform, account, native_post_id, content_hash, published_at
    ) VALUES (
      'ci-preview-content-valid','instagram','ci-preview','ci-native-2',
      repeat('a',64),now()
    );
    RAISE EXCEPTION 'Second receipt chain head was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.publication_receipts (
    queue_id, predecessor_receipt_id, platform, account,
    native_post_id, content_hash, published_at
  ) VALUES (
    'ci-preview-content-valid',first_receipt,'instagram','ci-preview',
    'ci-native-2',repeat('a',64),now()
  );

  BEGIN
    INSERT INTO public.post_metrics (
      receipt_id, "window", evidence_state, views
    ) VALUES (first_receipt, '24h', 'UNKNOWN_NO_EVIDENCE', 12);
    RAISE EXCEPTION 'UNKNOWN metric was coerced into a measured value';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.post_metrics (
    receipt_id, "window", evidence_state
  ) VALUES (first_receipt, '24h', 'UNKNOWN_NO_EVIDENCE');

  IF (SELECT count(*) FROM public.publication_receipts
      WHERE queue_id = 'ci-preview-content-valid') <> 2 THEN
    RAISE EXCEPTION 'Publication receipt successor chain not retained';
  END IF;
END
$proof$;

ROLLBACK;

-- The source migration and its real DDL remain on the isolated Neon branch;
-- test-only rows are rolled back. Supabase remains the authority.
