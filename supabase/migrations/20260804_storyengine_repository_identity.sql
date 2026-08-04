-- Reconcile the stable L99 project slug with the authoritative renamed repository.
-- This is idempotent and changes only the provider locator used by repository federation.
update projects
set
  repo_provider = 'github',
  repo_identifier = 'jussray/StoryEngine',
  updated_at = now()
where slug = 'l99'
  and (
    repo_provider is distinct from 'github'
    or repo_identifier is distinct from 'jussray/StoryEngine'
  );
