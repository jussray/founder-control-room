-- PREVIEW CONTRACT ONLY: generate a named Supabase migration from this source
-- and validate on a disposable database before any production application.
-- Server-only subscription material; no direct client table access.
begin;
create table public.founder_notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_hash text not null unique check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  encrypted_subscription text not null check (length(encrypted_subscription) between 30 and 5000),
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_test_at timestamptz,
  unique(user_id, endpoint_hash)
);
alter table public.founder_notification_subscriptions enable row level security;
revoke all on public.founder_notification_subscriptions from public, anon, authenticated;
grant select, insert, update on public.founder_notification_subscriptions to service_role;

create table public.founder_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.project_events(id) on delete cascade,
  subscription_id uuid not null references public.founder_notification_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','sending','retry','provider_accepted','failed','unknown')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  claim_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_status integer check (provider_status between 100 and 599),
  provider_accepted_at timestamptz,
  constraint founder_notification_delivery_event_subscription_key unique(event_id, subscription_id)
);
alter table public.founder_notification_deliveries enable row level security;
revoke all on public.founder_notification_deliveries from public, anon, authenticated;
grant select, insert, update on public.founder_notification_deliveries to service_role;
create index founder_notification_delivery_due_idx on public.founder_notification_deliveries(state, next_attempt_at);

-- The RPC runs with invoker privileges; only the server service role may call it.
create function public.claim_founder_notification_deliveries(owner_user_id uuid, batch_limit integer default 20)
returns table(delivery_id uuid, subscription_id uuid, user_id uuid,
  encrypted_subscription text, claim_token uuid, attempt_count integer, metadata jsonb)
language plpgsql security invoker set search_path = '' as $$
begin
  -- Materialize only recent, opted-in, founder-authorized notifications.
  insert into public.founder_notification_deliveries(event_id, subscription_id)
  select e.id, s.id
    from public.project_events e
    join public.founder_notification_subscriptions s
      on s.user_id = owner_user_id and s.revoked_at is null and s.enrolled_at <= e.created_at
    join public.founder_users f on f.user_id = s.user_id
   where e.event_type = 'founder_notification_intent'
     and e.created_at >= now() - interval '24 hours'
     and not exists (select 1 from public.founder_notification_deliveries d where d.event_id = e.id and d.subscription_id = s.id)
   order by e.created_at, e.id, s.id
   limit 200
  on conflict on constraint founder_notification_delivery_event_subscription_key do nothing;

  -- An interrupted final attempt is unknown, never falsely marked delivered.
  update public.founder_notification_deliveries d set state = 'unknown', claim_token = null
   where d.state = 'sending' and d.lease_until <= now() and d.attempt_count >= 3;

  return query with candidates as (
    select d.id
      from public.founder_notification_deliveries d
      join public.founder_notification_subscriptions s on s.id = d.subscription_id
      join public.founder_users f on f.user_id = s.user_id
      join public.project_events e on e.id = d.event_id
     where s.user_id = owner_user_id and s.revoked_at is null and s.enrolled_at <= e.created_at
       and e.created_at >= now() - interval '24 hours'
       and d.attempt_count < 3
       and ((d.state in ('pending','retry') and d.next_attempt_at <= now())
         or (d.state = 'sending' and d.lease_until <= now()))
     order by d.next_attempt_at, d.id
     limit greatest(1, least(coalesce(batch_limit, 20),20))
     for update of d skip locked
  ), claimed as (
    update public.founder_notification_deliveries d
       set state = 'sending', attempt_count = d.attempt_count + 1,
           claim_token = gen_random_uuid(), lease_until = now() + interval '5 minutes'
      from candidates c where d.id = c.id
    returning d.*
  )
  select c.id, c.subscription_id, s.user_id, s.encrypted_subscription,
         c.claim_token, c.attempt_count, e.metadata
    from claimed c
    join public.founder_notification_subscriptions s on s.id = c.subscription_id
    join public.project_events e on e.id = c.event_id;
end;
$$;
revoke all on function public.claim_founder_notification_deliveries(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_founder_notification_deliveries(uuid, integer) to service_role;
commit;
