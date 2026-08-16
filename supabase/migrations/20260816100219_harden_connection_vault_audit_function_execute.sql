-- Keep Connection Vault audit trigger functions server-only.
-- Trigger execution remains available to the table owner while direct RPC-style
-- execution is denied to browser-facing roles.

revoke all on function public.audit_connection_vault_binding_change()
  from public, anon, authenticated;

revoke all on function public.audit_fcr_api_token_change()
  from public, anon, authenticated;
