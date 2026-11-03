-- FCR-owned, append-only identity for external Jira mutations.
-- A claim is permanent: ambiguous outcomes must be verified, never reissued.
create table if not exists public.jira_action_claims (
  action_key text primary key,
  state text not null default 'claimed'
    check (state in ('claimed','provider-accepted','verified','outcome-unknown','denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jira_action_key_format check (action_key ~ '^fcr-jira-[A-Za-z0-9:-]+$')
);

alter table public.jira_action_claims enable row level security;
revoke all on public.jira_action_claims from public, anon, authenticated;
grant select, insert, update on public.jira_action_claims to service_role;

-- INSERT ... ON CONFLICT is the atomic claim, not a read-then-write lease.
create or replace function public.claim_jira_action_once(p_action_key text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_inserted boolean;
begin
  if p_action_key is null or p_action_key !~ '^fcr-jira-[A-Za-z0-9:-]+$' then
    raise exception 'invalid_jira_action_key' using errcode = '22023';
  end if;
  insert into public.jira_action_claims(action_key)
  values (p_action_key) on conflict (action_key) do nothing
  returning true into v_inserted;
  return coalesce(v_inserted, false);
end;
$$;

create or replace function public.transition_jira_action_claim(
  p_action_key text, p_next_state text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_updated boolean;
begin
  if p_next_state not in ('provider-accepted', 'outcome-unknown') then
    raise exception 'invalid_jira_action_transition' using errcode = '22023';
  end if;
  update public.jira_action_claims
  set state = p_next_state, updated_at = now()
  where action_key = p_action_key and state = 'claimed'
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

revoke all on function public.claim_jira_action_once(text) from public, anon, authenticated;
revoke all on function public.transition_jira_action_claim(text,text) from public, anon, authenticated;
grant execute on function public.claim_jira_action_once(text) to service_role;
grant execute on function public.transition_jira_action_claim(text,text) to service_role;
