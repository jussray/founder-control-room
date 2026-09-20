-- Command Bridge executed truth must be backed by one successful legacy read
-- terminal receipt. Verify/write execution remains reserved for the future
-- L99 ApprovalReceipt-aware executor and cannot be laundered through this table.

create or replace function public.guard_command_bridge_executed_receipt()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_run public.terminal_runs%rowtype;
begin
  if new.status is distinct from 'executed' then
    return new;
  end if;

  if old.status is distinct from 'approved' then
    raise exception 'command_bridge_execution_requires_approved_card'
      using errcode = '23514';
  end if;

  if old.expires_at is null or old.expires_at <= now() then
    raise exception 'command_bridge_execution_card_expired'
      using errcode = '23514';
  end if;

  if old.risk is distinct from 'read' then
    raise exception 'command_bridge_legacy_execution_read_only'
      using errcode = '23514';
  end if;

  if new.terminal_run_id is null then
    raise exception 'command_bridge_execution_receipt_required'
      using errcode = '23514';
  end if;

  select *
  into v_run
  from public.terminal_runs
  where id = new.terminal_run_id;

  if not found then
    raise exception 'command_bridge_execution_receipt_missing'
      using errcode = '23514';
  end if;

  if v_run.project_id is distinct from old.project_id
    or v_run.mission_id is distinct from old.mission_id
    or v_run.command_id is distinct from old.command_id
    or lower(v_run.expected_commit_sha) is distinct from lower(old.expected_commit_sha)
    or lower(v_run.observed_commit_sha) is distinct from lower(old.expected_commit_sha)
    or v_run.status is distinct from 'passed'
    or v_run.finished_at is null
    or v_run.output_truncated is distinct from false
  then
    raise exception 'command_bridge_execution_receipt_mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists command_bridge_executed_receipt_guard on public.command_bridge_requests;
create trigger command_bridge_executed_receipt_guard
before update of status, terminal_run_id on public.command_bridge_requests
for each row
when (new.status = 'executed')
execute function public.guard_command_bridge_executed_receipt();

revoke all on function public.guard_command_bridge_executed_receipt() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.guard_command_bridge_executed_receipt() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.guard_command_bridge_executed_receipt() from authenticated';
  end if;
end
$$;

comment on function public.guard_command_bridge_executed_receipt() is
  'Fail-closed invariant: legacy Command Bridge executed state requires one unexpired approved read card and an exact successful non-truncated terminal receipt.';
