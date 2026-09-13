-- Federated relay v3.1 authority/lineage hardening.
-- Source-only migration. This file is not a production apply.
-- Makes the atomic RPC the only service-role mutation path for accepted relay state,
-- pins the participant pair, and prevents ordinary continuations from extending expired parents.

do $migration$
declare
  accept_proc regprocedure;
begin
  select p.oid::regprocedure into accept_proc
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'federated_relay_accept_v31';
  if accept_proc is null then
    raise exception 'federated_relay_accept_v31_missing';
  end if;
  execute pg_catalog.format('alter function %s security definer', accept_proc);
  execute pg_catalog.format('alter function %s set search_path = pg_catalog', accept_proc);
end
$migration$;

create or replace function public.federated_relay_enforce_lineage_v31()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  parent_record public.federated_relay_messages%rowtype;
  same_direction boolean;
  inverted_direction boolean;
begin
  if new.relation_type = 'root' then return new; end if;
  select m.* into parent_record from public.federated_relay_messages as m where m.message_id = new.parent_message_id;
  if not found then raise exception 'relay_parent_missing'; end if;

  same_direction := new.source_member = parent_record.source_member
    and new.source_repository = parent_record.source_repository
    and new.source_branch = parent_record.source_branch
    and new.target_member = parent_record.target_member
    and new.target_repository = parent_record.target_repository
    and new.target_branch = parent_record.target_branch;
  inverted_direction := new.source_member = parent_record.target_member
    and new.source_repository = parent_record.target_repository
    and new.source_branch = parent_record.target_branch
    and new.target_member = parent_record.source_member
    and new.target_repository = parent_record.source_repository
    and new.target_branch = parent_record.source_branch;

  if not (same_direction or inverted_direction) then raise exception 'relay_chain_participant_pair_changed'; end if;
  if new.relation_type <> 'reconcile' and parent_record.expires_at < now() then raise exception 'relay_parent_expired_requires_reconcile'; end if;
  return new;
end;
$function$;

revoke all on function public.federated_relay_enforce_lineage_v31() from public, anon, authenticated;

drop trigger if exists federated_relay_messages_lineage_v31 on public.federated_relay_messages;
create trigger federated_relay_messages_lineage_v31 before insert on public.federated_relay_messages for each row execute function public.federated_relay_enforce_lineage_v31();

-- Accepted relay state is mutated only through the hardened SECURITY DEFINER RPC.
revoke insert, update, delete on table public.federated_relay_source_cursors from service_role;
revoke insert, update, delete on table public.federated_relay_chain_cursors from service_role;
revoke insert, update, delete on table public.federated_relay_messages from service_role;
revoke insert, update, delete on table public.federated_relay_supersessions from service_role;
grant select on table public.federated_relay_source_cursors, public.federated_relay_chain_cursors, public.federated_relay_messages, public.federated_relay_supersessions to service_role;
-- Key rotation and sender outbox remain separate service-role responsibilities.
