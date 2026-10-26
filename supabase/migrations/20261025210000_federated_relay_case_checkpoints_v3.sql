-- Private, compare-and-swap checkpoints for relay continuity.
-- Only trusted service-role code may read or mutate checkpoints.
create table if not exists public.federated_relay_case_checkpoints (
  case_id uuid not null,
  member text not null check (member in ('founder-control-room','chief-ai-machine','solcontinuity','promptos')),
  revision bigint not null default 0 check (revision >= 0),
  state text not null default 'open' check (state in ('open','at_rest','closed')),
  cursor bigint not null default -1 check (cursor >= -1),
  summary text not null default '' check (char_length(summary) <= 8000),
  next_gate text,
  proof_cookie text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(case_id,member)
);
alter table public.federated_relay_case_checkpoints enable row level security;
revoke all on public.federated_relay_case_checkpoints from public,anon,authenticated,service_role;
grant select on public.federated_relay_case_checkpoints to service_role;
-- Case creation is deliberately separate: never create a case from a public request.
create or replace function public.federated_relay_case_cas_v3(
  p_case_id uuid, p_member text, p_expected_revision bigint,
  p_cursor bigint, p_summary text, p_next_gate text, p_proof_cookie text, p_close boolean
) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_changed integer;
begin
  if p_member not in ('founder-control-room','chief-ai-machine','solcontinuity','promptos')
    or p_summary is null or length(p_summary)>8000 or p_cursor < -1 then
    raise exception 'relay_case_invalid';
  end if;
  update public.federated_relay_case_checkpoints
  set revision=revision+1, cursor=p_cursor, summary=p_summary,
      next_gate=case when p_close then null else p_next_gate end,
      proof_cookie=p_proof_cookie,
      state=case when p_close then 'closed' else 'at_rest' end,
      updated_at=clock_timestamp()
  where case_id=p_case_id and member=p_member and revision=p_expected_revision
    and state <> 'closed' and cursor<=p_cursor;
  get diagnostics v_changed = row_count;
  return v_changed=1;
end; $$;
revoke all on function public.federated_relay_case_cas_v3(uuid,text,bigint,bigint,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.federated_relay_case_cas_v3(uuid,text,bigint,bigint,text,text,text,boolean) to service_role;
