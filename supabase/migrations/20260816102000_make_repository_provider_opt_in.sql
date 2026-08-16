-- Founder Control Room projects are first-class even when no repository is attached.
-- Repository providers are capabilities, not prerequisites for project existence.

alter table public.projects
  alter column repo_provider set default 'none';
