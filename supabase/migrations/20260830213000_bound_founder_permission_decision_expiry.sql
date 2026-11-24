-- Forward-only successor for the Ask-Founder decision-expiry invariant.
--
-- Do not rewrite 20260829055000_harden_founder_permission_broker.sql: it may
-- already exist in provider history. This successor makes the documented
-- 20-minute decision window a durable database constraint.

alter table public.founder_permission_requests
  drop constraint if exists founder_permission_expiry_after_decision;

alter table public.founder_permission_requests
  add constraint founder_permission_expiry_after_decision
  check (
    expires_at is null
    or (
      decided_at is not null
      and expires_at > decided_at
      and expires_at <= decided_at + interval '20 minutes'
    )
  );

comment on constraint founder_permission_expiry_after_decision
  on public.founder_permission_requests is
  'Founder decision expiry must be after decided_at and no later than the fixed 20-minute authority window.';
