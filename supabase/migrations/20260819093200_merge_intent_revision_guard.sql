-- =============================================================================
-- Merge-intent optimistic revision guard
--
-- Reconciliation is read-only with respect to the provider but still writes the
-- liveness projection. A provider execution reservation or a new founder
-- approval can race that write. Revision + state compare-and-set prevents a
-- stale reconciliation from overwriting EXECUTING/MERGED or a newer approval.
-- =============================================================================

begin;

alter table merge_intents
  add column if not exists revision bigint not null default 1
    check (revision > 0);

create or replace function bump_merge_intent_revision_on_approval_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if row(
    new.repository,
    new.pull_request_number,
    new.target_branch,
    new.source_branch,
    new.approved_base_sha,
    new.approved_head_sha,
    new.approval_proof_id,
    new.approved_by,
    new.approved_author_identity,
    new.review_policy_hash,
    new.proof_expires_at
  ) is distinct from row(
    old.repository,
    old.pull_request_number,
    old.target_branch,
    old.source_branch,
    old.approved_base_sha,
    old.approved_head_sha,
    old.approval_proof_id,
    old.approved_by,
    old.approved_author_identity,
    old.review_policy_hash,
    old.proof_expires_at
  ) then
    new.revision := old.revision + 1;
  else
    -- Projection-only writes never get to manufacture a new approval revision.
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

revoke all on function bump_merge_intent_revision_on_approval_identity_change() from public;

drop trigger if exists merge_intents_bump_approval_revision on merge_intents;
create trigger merge_intents_bump_approval_revision
  before update on merge_intents
  for each row
  execute function bump_merge_intent_revision_on_approval_identity_change();

comment on column merge_intents.revision is
  'Optimistic approval-identity revision. Reconciliation must compare-and-set both revision and observed state.';

commit;
