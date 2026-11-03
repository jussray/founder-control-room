-- Runs only against the ephemeral PostgreSQL GitHub Actions service.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
\i supabase/migrations/20261103000000_jira_action_claims.sql

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.jira_action_claims'::regclass) then
    raise exception 'RLS is disabled';
  end if;
  if has_table_privilege('anon', 'public.jira_action_claims', 'SELECT')
     or has_table_privilege('authenticated', 'public.jira_action_claims', 'INSERT')
     or has_function_privilege('anon', 'public.claim_jira_action_once(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.transition_jira_action_claim(text,text)', 'EXECUTE') then
    raise exception 'untrusted role has claim permissions';
  end if;
  if not has_function_privilege('service_role', 'public.claim_jira_action_once(text)', 'EXECUTE') then
    raise exception 'service role cannot claim';
  end if;
end $$;

set role service_role;
do $$
begin
  if not public.claim_jira_action_once('fcr-jira-ci:1') then
    raise exception 'first claim did not win';
  end if;
  if public.claim_jira_action_once('fcr-jira-ci:1') then
    raise exception 'replay won an existing claim';
  end if;
  if not public.transition_jira_action_claim('fcr-jira-ci:1', 'provider-accepted') then
    raise exception 'accepted transition failed';
  end if;
  if public.transition_jira_action_claim('fcr-jira-ci:1', 'outcome-unknown') then
    raise exception 'terminal claim was overwritten';
  end if;
  if not public.claim_jira_action_once('fcr-jira-ci:2') then
    raise exception 'second claim did not win';
  end if;
  if not public.transition_jira_action_claim('fcr-jira-ci:2', 'outcome-unknown') then
    raise exception 'unknown transition failed';
  end if;
end $$;
reset role;
