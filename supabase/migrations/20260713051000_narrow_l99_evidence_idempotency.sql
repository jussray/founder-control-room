begin;

drop index if exists public.evidence_project_commit_kind_environment_uidx;

create unique index if not exists evidence_project_commit_kind_environment_provider_ref_uidx
  on public.evidence (project_id, commit_sha, kind, environment, provider, details_ref);

comment on index public.evidence_project_commit_kind_environment_provider_ref_uidx is
  'Prevents duplicate evidence from the same provider/reference while allowing independent evidence sources for one commit.';

commit;
