-- FCR Durable Agent Execution Kernel v11.5 authority-role hardening.
-- Append-only successor to 20260926070000_agent_durable_execution_kernel_v11_5.sql.
-- The bootstrap migration was already preview-receipted and must not be rewritten.

-- Keep kernel tables unavailable to browser roles and the generic application
-- service role. Narrow runtime grants belong in a later activation migration
-- after dedicated issuer / PEP / worker identities are proven.
revoke all on table public.agent_task_authority_state from public, anon, authenticated, service_role;
revoke all on table public.agent_execution_admissions from public, anon, authenticated, service_role;
revoke all on table public.agent_execution_receipts from public, anon, authenticated, service_role;
revoke all on table public.agent_execution_outbox from public, anon, authenticated, service_role;

revoke execute on function public.initialize_agent_task_authority_v11_5(text, bigint) from public, anon, authenticated, service_role;
revoke execute on function public.transition_agent_task_authority_v11_5(text, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.admit_agent_execution_v11_5(uuid, uuid, uuid, text, text, text, text, text, text, text, bigint, timestamptz, timestamptz, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.lease_agent_execution_outbox_v11_5(text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.record_agent_execution_outcome_v11_5(uuid, uuid, text, bigint, text, text) from public, anon, authenticated, service_role;
