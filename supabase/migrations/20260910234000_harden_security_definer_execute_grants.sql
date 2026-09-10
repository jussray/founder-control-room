-- =============================================================================
-- Harden SECURITY DEFINER function execution grants.
--
-- Production advisor readback showed these privileged functions remained
-- directly executable by anon/authenticated roles. They are trigger-only,
-- service-owned maintenance functions, or server-side RPCs. Keep privileged
-- execution available to service_role while removing browser-callable RPC
-- authority. This migration changes grants only; function bodies and triggers
-- are unchanged.
-- =============================================================================

begin;

revoke all on function public.anonymize_user_audit_logs(uuid)
  from public, anon, authenticated;
grant execute on function public.anonymize_user_audit_logs(uuid)
  to service_role;

revoke all on function public.bump_merge_intent_revision_on_approval_identity_change()
  from public, anon, authenticated;
grant execute on function public.bump_merge_intent_revision_on_approval_identity_change()
  to service_role;

revoke all on function public.enforce_fcr_merge_intent_execution_veto()
  from public, anon, authenticated;
grant execute on function public.enforce_fcr_merge_intent_execution_veto()
  to service_role;

revoke all on function public.enqueue_merge_intent_reconciliation()
  from public, anon, authenticated;
grant execute on function public.enqueue_merge_intent_reconciliation()
  to service_role;

revoke all on function public.project_fcr_merge_intent_on_approval()
  from public, anon, authenticated;
grant execute on function public.project_fcr_merge_intent_on_approval()
  to service_role;

revoke all on function public.project_merge_intent_execution_lifecycle()
  from public, anon, authenticated;
grant execute on function public.project_merge_intent_execution_lifecycle()
  to service_role;

revoke all on function public.project_merge_intent_mission_lifecycle()
  from public, anon, authenticated;
grant execute on function public.project_merge_intent_mission_lifecycle()
  to service_role;

revoke all on function public.purge_stale_devices()
  from public, anon, authenticated;
grant execute on function public.purge_stale_devices()
  to service_role;

revoke all on function public.return_revoked_fcr_merge_to_review()
  from public, anon, authenticated;
grant execute on function public.return_revoked_fcr_merge_to_review()
  to service_role;

commit;
