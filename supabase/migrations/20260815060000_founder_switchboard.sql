-- Founder Switchboard
-- Durable founder desired-state controls plus immutable audit receipts.
-- This table is operational authority state only. It stores no provider
-- credentials, user content, customer data, teen data, or product data.

create table if not exists public.founder_switch_overrides (
  switch_id text primary key
    check (char_length(switch_id) between 3 and 120),
  desired_state text not null
    check (desired_state in ('on', 'off')),
  reason text
    check (reason is null or char_length(reason) <= 500),
  updated_by text
    check (updated_by is null or char_length(updated_by) <= 320),
  updated_at timestamptz not null default now()
);

comment on table public.founder_switch_overrides is
  'Founder Control Room desired-state overrides for governed portfolio capabilities. Server-only operational authority state.';

create table if not exists public.founder_switch_events (
  id uuid primary key default gen_random_uuid(),
  switch_id text not null
    check (char_length(switch_id) between 3 and 120),
  previous_state text not null
    check (previous_state in ('on', 'off')),
  desired_state text not null
    check (desired_state in ('on', 'off')),
  reason text
    check (reason is null or char_length(reason) <= 500),
  actor_email text
    check (actor_email is null or char_length(actor_email) <= 320),
  created_at timestamptz not null default now()
);

comment on table public.founder_switch_events is
  'Append-only evidence receipts for founder switch state changes. Server-only operational authority evidence.';

create index if not exists founder_switch_events_switch_created_idx
  on public.founder_switch_events (switch_id, created_at desc);

alter table public.founder_switch_overrides enable row level security;
alter table public.founder_switch_events enable row level security;

revoke all on table public.founder_switch_overrides from public, anon, authenticated;
revoke all on table public.founder_switch_events from public, anon, authenticated;

-- The application service role may read state/history but cannot directly
-- mutate either table. All writes must pass through the atomic function below.
revoke insert, update, delete, truncate, references, trigger
  on table public.founder_switch_overrides from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.founder_switch_events from service_role;
grant select on table public.founder_switch_overrides to service_role;
grant select on table public.founder_switch_events to service_role;

create or replace function public.set_founder_switch_state(
  p_switch_id text,
  p_previous_state text,
  p_desired_state text,
  p_reason text,
  p_actor_email text
)
returns table (
  switch_id text,
  desired_state text,
  reason text,
  updated_by text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing_state text;
  v_updated_at timestamptz := now();
begin
  if p_switch_id is null or char_length(p_switch_id) not between 3 and 120 then
    raise exception 'invalid switch id';
  end if;

  if p_previous_state not in ('on', 'off') then
    raise exception 'invalid previous switch state';
  end if;

  if p_desired_state not in ('on', 'off') then
    raise exception 'invalid desired switch state';
  end if;

  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'switch reason exceeds 500 characters';
  end if;

  if p_actor_email is null or char_length(btrim(p_actor_email)) not between 3 and 320 then
    raise exception 'invalid switch actor';
  end if;

  -- Serialize writers per switch, including the first override where no row
  -- exists yet. The row lock below cannot protect a missing row by itself.
  perform pg_advisory_xact_lock(hashtextextended(p_switch_id, 0));

  -- Bind the mutation to the state the caller actually observed. This makes a
  -- stale confirmation fail instead of silently overwriting a newer founder
  -- decision from another session.
  select fso.desired_state
    into v_existing_state
    from public.founder_switch_overrides as fso
   where fso.switch_id = p_switch_id
   for update;

  if v_existing_state is not null and v_existing_state <> p_previous_state then
    raise exception 'stale switch state';
  end if;

  insert into public.founder_switch_overrides (
    switch_id,
    desired_state,
    reason,
    updated_by,
    updated_at
  ) values (
    p_switch_id,
    p_desired_state,
    nullif(btrim(p_reason), ''),
    btrim(p_actor_email),
    v_updated_at
  )
  on conflict on constraint founder_switch_overrides_pkey do update
    set desired_state = excluded.desired_state,
        reason = excluded.reason,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  insert into public.founder_switch_events (
    switch_id,
    previous_state,
    desired_state,
    reason,
    actor_email,
    created_at
  ) values (
    p_switch_id,
    p_previous_state,
    p_desired_state,
    nullif(btrim(p_reason), ''),
    btrim(p_actor_email),
    v_updated_at
  );

  return query
    select fso.switch_id,
           fso.desired_state,
           fso.reason,
           fso.updated_by,
           fso.updated_at
      from public.founder_switch_overrides as fso
     where fso.switch_id = p_switch_id;
end;
$$;

revoke all on function public.set_founder_switch_state(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_founder_switch_state(text, text, text, text, text)
  to service_role;