-- =============================================================================
-- Harden reconciliation queue coalescing and controller lease acquisition.
-- Recovered from the live Founder Control Room migration history so fresh
-- environments preserve the same queue and concurrency contract as production.
-- =============================================================================

alter table public.controller_outbox
  drop constraint if exists controller_outbox_coalesce;

alter table public.controller_outbox
  add constraint controller_outbox_coalesce
  unique(project_id, controller, resource_id)
  not deferrable;

create or replace function public.try_acquire_controller_lease(
  p_lease_key text,
  p_ttl_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean := false;
  v_now timestamptz := now();
begin
  if coalesce(btrim(p_lease_key), '') = '' then
    raise exception 'lease_key_required' using errcode = '22023';
  end if;
  if p_ttl_seconds < 5 or p_ttl_seconds > 3600 then
    raise exception 'lease_ttl_out_of_range' using errcode = '22023';
  end if;

  insert into public.controller_leases as lease (
    lease_key,
    claimed_at,
    expires_at
  ) values (
    p_lease_key,
    v_now,
    v_now + make_interval(secs => p_ttl_seconds)
  )
  on conflict (lease_key) do update
    set claimed_at = excluded.claimed_at,
        expires_at = excluded.expires_at
    where lease.expires_at <= v_now
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

revoke all on function public.try_acquire_controller_lease(text, integer) from public;
revoke all on function public.try_acquire_controller_lease(text, integer) from anon;
revoke all on function public.try_acquire_controller_lease(text, integer) from authenticated;
grant execute on function public.try_acquire_controller_lease(text, integer) to service_role;

comment on function public.try_acquire_controller_lease(text, integer) is
  'Service-role-only atomic lease acquisition; replaces expired leases and rejects live contention.';
