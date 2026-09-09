-- Keep account-deletion maintenance functions server-only.
-- This migration is source-only until an explicitly authorized production apply.
-- Committing it performs no provider or production database mutation.
--
-- Both functions are SECURITY DEFINER because their maintenance work must cross
-- ordinary browser-facing RLS boundaries. Direct RPC-style execution by
-- PUBLIC/anon/authenticated is therefore denied while service_role retains the
-- explicit server-side call path used by FCR deletion workers.

revoke all on function public.anonymize_user_audit_logs(uuid)
  from public, anon, authenticated;

grant execute on function public.anonymize_user_audit_logs(uuid)
  to service_role;

revoke all on function public.purge_stale_devices()
  from public, anon, authenticated;

grant execute on function public.purge_stale_devices()
  to service_role;
