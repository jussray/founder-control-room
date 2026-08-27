-- Forward hardening for the production-applied LinkedIn experiment log.
-- Preserve founder direct-session access through the existing is_founder()
-- allowlist while removing broad anon/authenticated authority and making the
-- reporting view execute with caller privileges so base-table RLS is honored.

alter table public.linkedin_experiments enable row level security;

drop policy if exists founder_full_access on public.linkedin_experiments;
create policy founder_full_access
  on public.linkedin_experiments
  for all
  to authenticated
  using (public.is_founder())
  with check (public.is_founder());

revoke all privileges on table public.linkedin_experiments from anon, authenticated;
grant select, insert, update, delete on table public.linkedin_experiments to authenticated;
grant all privileges on table public.linkedin_experiments to service_role;

alter view public.linkedin_winning_patterns set (security_invoker = true);
revoke all privileges on table public.linkedin_winning_patterns from anon, authenticated;
grant select on table public.linkedin_winning_patterns to authenticated;
grant select on table public.linkedin_winning_patterns to service_role;

comment on view public.linkedin_winning_patterns is
  'Founder-only LinkedIn winning-pattern summary. SECURITY INVOKER forces base-table RLS to evaluate the caller through is_founder().';
