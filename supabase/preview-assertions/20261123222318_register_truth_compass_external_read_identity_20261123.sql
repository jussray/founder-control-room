-- Read back the actual registration on the isolated Neon branch, not production.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.projects WHERE slug = 'truth-compass') <> 1 THEN
    RAISE EXCEPTION 'Truth Compass preview registration missing or duplicated';
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
  ) THEN
    RAISE EXCEPTION 'Unexpected Truth Compass preview identity or status';
  END IF;
END;
$$;
