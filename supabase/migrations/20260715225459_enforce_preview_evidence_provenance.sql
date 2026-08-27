-- Manual preview evidence must never be relabeled as signed automation.

alter table public.repository_verification_runs
  drop constraint if exists repository_preview_evidence_must_be_unsigned;

alter table public.repository_verification_runs
  add constraint repository_preview_evidence_must_be_unsigned
  check (
    coalesce(runner->>'mode', '') not like 'preview_branch_%'
    or (
      source = 'runner'
      and signature_verified = false
    )
  );

comment on constraint repository_preview_evidence_must_be_unsigned
  on public.repository_verification_runs is
  'Any preview_branch_* evidence must use runner source and remain signature_verified=false.';
