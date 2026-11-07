-- Remove residual browser-role authority from trigger-only maintenance functions.
-- This migration is source-only until an explicitly authorized production apply.
-- Committing it performs no provider or production database mutation.
--
-- These merge-intent functions all return trigger. Their trigger execution is
-- owned by PostgreSQL/table authority and does not require browser roles to hold
-- direct EXECUTE. Explicit anon/authenticated grants only widen the exposed RPC
-- surface, so revoke them while preserving server/owner behavior.

revoke all on function public.bump_merge_intent_revision_on_approval_identity_change()
  from public, anon, authenticated;
revoke all on function public.enforce_fcr_merge_intent_execution_veto()
  from public, anon, authenticated;
revoke all on function public.enqueue_merge_intent_reconciliation()
  from public, anon, authenticated;
revoke all on function public.project_fcr_merge_intent_on_approval()
  from public, anon, authenticated;
revoke all on function public.project_merge_intent_execution_lifecycle()
  from public, anon, authenticated;
revoke all on function public.project_merge_intent_mission_lifecycle()
  from public, anon, authenticated;
revoke all on function public.return_revoked_fcr_merge_to_review()
  from public, anon, authenticated;

-- This timestamp trigger is SECURITY INVOKER, but an unpinned search_path is an
-- unnecessary resolution surface. Its body uses only NEW and pg_catalog.now().
alter function public.update_linkedin_experiments_updated_at()
  set search_path = pg_catalog;
