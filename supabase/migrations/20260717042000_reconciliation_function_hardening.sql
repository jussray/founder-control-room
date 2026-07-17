-- Forward-only hardening for reconciliation SECURITY DEFINER functions.
-- Existing deployed migrations remain immutable; this migration repairs the
-- current definitions with a fixed search_path and service-role-only access.

create or replace function public.claim_outbox_work(p_limit int default 10)
returns setof public.controller_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.controller_outbox
  set claimed_at = now()
  where id in (
    select id
    from public.controller_outbox
    where completed_at is null
      and claimed_at is null
      and available_at <= now()
    order by available_at asc
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

create or replace function public.fail_outbox_work(p_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.controller_outbox
  set
    claimed_at = null,
    attempt_count = attempt_count + 1,
    last_error = p_error,
    available_at = now() + (interval '1 second' * power(2, least(attempt_count, 6)))
  where id = p_id;
$$;

create or replace function public.increment_attempt_count(row_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.provider_events
  set attempt_count = attempt_count + 1
  where id = row_id;
$$;

revoke execute on function public.claim_outbox_work(int) from public, anon, authenticated;
revoke execute on function public.fail_outbox_work(uuid, text) from public, anon, authenticated;
revoke execute on function public.increment_attempt_count(uuid) from public, anon, authenticated;

grant execute on function public.claim_outbox_work(int) to service_role;
grant execute on function public.fail_outbox_work(uuid, text) to service_role;
grant execute on function public.increment_attempt_count(uuid) to service_role;
