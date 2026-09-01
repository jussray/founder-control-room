-- Forward-only reconciliation for production state already recorded under the
-- historical onboarding/steady-state and LinkedIn migration identities.
--
-- This migration intentionally preserves public.user_onboarding_state and all
-- existing rows. It only retires the two known FCR cron jobs that still target
-- that cross-project mirror and reapplies the server-owned LinkedIn boundary.

-- Unschedule only the exact retired FCR jobs, and only while their command still
-- targets the retired onboarding mirror. The loop is idempotent when jobs are gone.
do $$
declare
  retired_job record;
begin
  if to_regclass('cron.job') is not null then
    for retired_job in
      select jobid
      from cron.job
      where jobname in ('advance-to-steady-state', 'flag-stuck-users')
        and command ilike '%public.user_onboarding_state%'
    loop
      perform cron.unschedule(retired_job.jobid);
    end loop;
  end if;
end
$$;

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
