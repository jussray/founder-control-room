-- Preserve one authoritative identity for each FCR project.
-- This migration is additive and deliberately fail-closed. Existing collisions
-- must be resolved by the founder before deployment: never delete, merge or
-- silently rename project records.
-- Rollback: DROP INDEX IF EXISTS public.projects_unique_normalized_name;
--           DROP INDEX IF EXISTS public.projects_unique_normalized_repository;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects
    GROUP BY lower(btrim(name))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'FCR project names contain collisions; founder review required before adding uniqueness'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.projects
    WHERE repo_identifier IS NOT NULL AND btrim(repo_identifier) <> ''
    GROUP BY lower(btrim(repo_identifier))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'FCR project repository identifiers contain collisions; founder review required before adding uniqueness'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_unique_normalized_name
  ON public.projects (lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS projects_unique_normalized_repository
  ON public.projects (lower(btrim(repo_identifier)))
  WHERE repo_identifier IS NOT NULL AND btrim(repo_identifier) <> '';
