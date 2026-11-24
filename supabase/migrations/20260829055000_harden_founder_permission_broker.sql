-- Forward-only hardening for the Ask-Founder broker introduced by
-- 20260827224500_founder_permission_requests.sql.
--
-- Do not rewrite the earlier migration: it may already exist in provider
-- history. This successor adds the durable fields needed to keep a recorded
-- founder decision exact-scope, expiring, revocable, and one-time consumable.

alter table public.founder_permission_requests
  add column if not exists action_target jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz;

-- Historical decided rows predate the bounded-expiry contract. Give them the
-- same narrow 20-minute window from their original decision time rather than
-- manufacturing a fresh window at migration-apply time.
update public.founder_permission_requests
set expires_at = decided_at + interval '20 minutes'
where status <> 'pending'
  and decided_at is not null
  and expires_at is null;

alter table public.founder_permission_requests
  drop constraint if exists founder_permission_action_target_object;
alter table public.founder_permission_requests
  add constraint founder_permission_action_target_object
  check (action_target is null or jsonb_typeof(action_target) = 'object');

alter table public.founder_permission_requests
  drop constraint if exists founder_permission_expiry_after_decision;
alter table public.founder_permission_requests
  add constraint founder_permission_expiry_after_decision
  check (expires_at is null or decided_at is null or expires_at > decided_at);

alter table public.founder_permission_requests
  drop constraint if exists founder_permission_revocation_after_request;
alter table public.founder_permission_requests
  add constraint founder_permission_revocation_after_request
  check (revoked_at is null or revoked_at >= requested_at);

create index if not exists founder_permission_requests_active_decision_idx
  on public.founder_permission_requests (status, expires_at)
  where consumed_at is null and revoked_at is null;

comment on column public.founder_permission_requests.action_target is
  'Structured action identity used by the broker request hash. Merge requests bind repo, PR, base SHA, and head SHA.';
comment on column public.founder_permission_requests.expires_at is
  'Bounded validity deadline for a recorded founder decision; expiry never grants or extends execution authority.';
comment on column public.founder_permission_requests.revoked_at is
  'Founder revocation timestamp. Revoked decisions are never satisfiable or consumable.';
