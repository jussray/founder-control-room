-- Forward hardening for the production-applied LinkedIn experiment log.
-- Keep this data server-owned. The canonical public.is_founder() helper is
-- intentionally callable only by service_role, so direct authenticated access
-- must not depend on a predicate that authenticated sessions cannot execute.

alter table public.linkedin_experiments enable row level security;

drop policy if exists founder_full_access on public.linkedin_experiments;

revoke all privileges on table public.linkedin_experiments from anon, authenticated;
grant all privileges on table public.linkedin_experiments to service_role;

alter view public.linkedin_winning_patterns set (security_invoker = true);
revoke all privileges on table public.linkedin_winning_patterns from anon, authenticated;
grant select on table public.linkedin_winning_patterns to service_role;

comment on table public.linkedin_experiments is
  'Server-owned LinkedIn experiment ledger. Direct anon/authenticated access is denied; founder access remains behind the service-role application boundary.';

comment on view public.linkedin_winning_patterns is
  'Server-owned LinkedIn winning-pattern summary. Direct anon/authenticated access is denied.';
