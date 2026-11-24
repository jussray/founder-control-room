-- Isolated preview postconditions for the unchanged historical migration.
-- This verifies the registration row, not external access or execution authority.
DO $$
BEGIN
  IF to_regclass('ci_preview.migration_receipts') IS NULL THEN
    RAISE EXCEPTION 'Expected isolated preview migration ledger';
  END IF;
  IF (SELECT count(*) FROM public.projects WHERE slug = 'truth-compass') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Truth Compass identity';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE slug = 'truth-compass'
      AND name = 'Truth Compass'
      AND repo_provider = 'github'
      AND repo_identifier = 'jussray/truth-compass'
      AND stack = 'tanstack start + supabase'
      AND status = 'paused'
      AND risk_level = 'low'
      AND cloudflare_account IS NULL
      AND supabase_project IS NULL
  ) THEN
    RAISE EXCEPTION 'Truth Compass preview identity differs from the historical paused registration';
  END IF;
END;
$$;
