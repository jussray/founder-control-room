-- Capability evidence must remain internally self-consistent regardless of
-- whether it came from an active scan, signed runner packet, or manual preview.

alter table public.repository_capability_evidence
  drop constraint if exists repository_capability_missing_evidence_subset,
  drop constraint if exists repository_capability_failed_signals_subset;

alter table public.repository_capability_evidence
  add constraint repository_capability_missing_evidence_subset
    check (missing_evidence_paths <@ evidence_paths),
  add constraint repository_capability_failed_signals_subset
    check (failed_signal_ids <@ required_signal_ids);

comment on constraint repository_capability_missing_evidence_subset
  on public.repository_capability_evidence is
  'Every missing evidence path must be one of the capability declared evidence paths.';

comment on constraint repository_capability_failed_signals_subset
  on public.repository_capability_evidence is
  'Every failed verification signal must be one of the capability required signals.';
