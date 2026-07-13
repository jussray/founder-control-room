begin;

create unique index if not exists project_events_project_source_event_uidx
  on public.project_events (project_id, source_event_id);

create unique index if not exists evidence_project_commit_kind_environment_uidx
  on public.evidence (project_id, commit_sha, kind, environment);

comment on index public.project_events_project_source_event_uidx is
  'Prevents duplicate sanitized provider observations for the same project and source event.';

comment on index public.evidence_project_commit_kind_environment_uidx is
  'Prevents duplicate portfolio evidence for the same project, commit, kind, and environment.';

commit;
