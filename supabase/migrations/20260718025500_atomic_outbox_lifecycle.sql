-- =============================================================================
-- Atomic outbox lifecycle.
--
-- Completion and terminal abandonment update controller_outbox and the linked
-- provider_events row in one transaction so operational truth cannot split.
-- =============================================================================

create or replace function public.complete_outbox_work(
  p_id uuid,
  p_source_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.controller_outbox
  set completed_at = now(),
      claimed_at = null,
      last_error = null
  where id = p_id
    and completed_at is null;

  if not found then
    raise exception 'outbox_work_not_found_or_completed' using errcode = 'P0002';
  end if;

  if p_source_event_id is not null then
    update public.provider_events
    set processing_status = 'processed',
        processed_at = now(),
        last_error = null
    where id = p_source_event_id;

    if not found then
      raise exception 'provider_event_not_found' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

create or replace function public.abandon_outbox_work(
  p_id uuid,
  p_source_event_id uuid default null,
  p_error text default 'retry limit reached'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.controller_outbox
  set completed_at = now(),
      claimed_at = null,
      attempt_count = attempt_count + 1,
      last_error = p_error
  where id = p_id
    and completed_at is null;

  if not found then
    raise exception 'outbox_work_not_found_or_completed' using errcode = 'P0002';
  end if;

  if p_source_event_id is not null then
    update public.provider_events
    set processing_status = 'failed',
        processed_at = now(),
        attempt_count = attempt_count + 1,
        last_error = p_error
    where id = p_source_event_id;

    if not found then
      raise exception 'provider_event_not_found' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

revoke all on function public.complete_outbox_work(uuid, uuid) from public, anon, authenticated;
revoke all on function public.abandon_outbox_work(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_outbox_work(uuid, uuid) to service_role;
grant execute on function public.abandon_outbox_work(uuid, uuid, text) to service_role;

comment on function public.complete_outbox_work(uuid, uuid) is
  'Atomically completes durable controller work and marks its source provider event processed.';
comment on function public.abandon_outbox_work(uuid, uuid, text) is
  'Atomically terminally completes poison controller work and marks its source provider event failed.';
