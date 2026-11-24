-- Ephemeral Neon compatibility fixture only; never a live migration.
-- Restore the projects dependency only when the isolated preview lacks it.
-- Column types, defaults and constraints were checked against the live catalog
-- and the original control-room schema migration. No production data is copied.
SET LOCAL search_path = public, pg_catalog;
DO $$
BEGIN
  IF to_regclass('ci_preview.migration_receipts') IS NULL THEN
    RAISE EXCEPTION 'Expected isolated preview migration ledger';
  END IF;
  IF to_regclass('public.projects') IS NULL THEN
    CREATE TABLE public.projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text UNIQUE NOT NULL,
      name text NOT NULL,
      repo_provider text NOT NULL DEFAULT 'none',
      repo_identifier text,
      cloudflare_account text,
      supabase_project text,
      stack text,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
      risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      verification_enabled boolean NOT NULL DEFAULT true,
      verification_cadence_minutes integer NOT NULL DEFAULT 15 CHECK (verification_cadence_minutes BETWEEN 5 AND 1440)
    );
    ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.projects FROM PUBLIC;
  END IF;
END;
$$;
