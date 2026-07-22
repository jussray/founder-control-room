-- =============================================================================
-- Harden outbox claim ownership and stale recovery.
--
-- This is forward-only. Do not rewrite earlier deployed reconciliation migrations.
-- Stale claimed rows may be reclaimed after a bounded timeout, and every
-- completion, retry, or terminal abandonment must prove it still owns the
-- current claim token.
-- =============================================================================

drop function if exists public.claim_outbox_work(int);
drop function if exists public.fail_outbox_work(uuid, text);
drop function if exists public.complete_outbox_work(uuid, uuid);
drop function if exists public.abandon_outbox_work(uuid, uuid, text);

create or replace function public.claim_outbox_work(
  p_limit int default 10,
  p_stale_after_seconds int default 300
)
returns setof public.controller_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_stale_before timestamptz;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'claim_limit_out_of_range' using errcode = '22023';
  end if;

  if p_stale_after_seconds < 30 or p_stale_after_seconds > 3600 then
    raise exception 'claim_stale_after_out_of_range' using errcode = '22023';
  end if;

  v_stale_before := v_now - make_interval(secs => p_stale_after_seconds);

  return query
  update public.controller_outbox as work
  set
    claimed_at = v_now,
    attempt_count = case
      when work.claimed_at is not null and work.claimed_at <= v_stale_before
        then work.attempt_count + 1
      else work.attempt_count
    end,
    last_error = case
      when work.claimed_at is not null and work.claimed_at <= v_stale_before
        then coalesce(work.last_error, 'reclaimed_stale_outbox_claim')
      else work.last_error
    end
  where work.id in (
    select candidate.id
    from public.controller_outbox as candidate
    where candidate.completed_at is null
      and candidate.available_at <= v_now
      and (
        candidate.claimed_at is null
        or candidate.claimed_at <= v_stale_before
      )
    order by candidate.available_at asc
    limit p_limit
    for update skip locked
  )
  returning work.*;
end;
$$;

create or replace function public.fail_outbox_work(
  p_id uuid,
  p_claimed_at timestamptz,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.controller_outbox
  set
    claimed_at = null,
    attempt_count = attempt_count + 1,
    last_error = p_error,
    available_at = now() + (interval '1 second' * power(2, least(attempt_count, 6)))
  where id = p_id
    and claimed_at = p_claimed_at
    and completed_at is null;

  if not found then
    raise exception 'outbox_work_claim_not_owned' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.complete_outbox_work(
  p_id uuid,
  p_claimed_at timestamptz,
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
    and claimed_at = p_claimed_at
    and completed_at is null;

  if not found then
    raise exception 'outbox_work_claim_not_owned_or_completed' using errcode = 'P0002';
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
  p_claimed_at timestamptz,
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
    and claimed_at = p_claimed_at
    and completed_at is null;

  if not found then
    raise exception 'outbox_work_claim_not_owned_or_completed' using errcode = 'P0002';
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

revoke all on function public.claim_outbox_work(int, int) from public, anon, authenticated;
revoke all on function public.fail_outbox_work(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.complete_outbox_work(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.abandon_outbox_work(uuid, timestamptz, uuid, text) from public, anon, authenticated;

grant execute on function public.claim_outbox_work(int, int) to service_role;
grant execute on function public.fail_outbox_work(uuid, timestamptz, text) to service_role;
grant execute on function public.complete_outbox_work(uuid, timestamptz, uuid) to service_role;
grant execute on function public.abandon_outbox_work(uuid, timestamptz, uuid, text) to service_role;

comment on function public.claim_outbox_work(int, int) is
  'Atomically claims unclaimed or stale controller work and returns claimed_at as the ownership token.';
comment on function public.fail_outbox_work(uuid, timestamptz, text) is
  'Retries controller work only when the caller still owns the current claim token.';
comment on function public.complete_outbox_work(uuid, timestamptz, uuid) is
  'Completes controller work and marks its source event processed only when the caller owns the current claim token.';
comment on function public.abandon_outbox_work(uuid, timestamptz, uuid, text) is
  'Terminally abandons controller work and marks its source event failed only when the caller owns the current claim token.';
