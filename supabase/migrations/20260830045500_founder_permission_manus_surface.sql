-- Forward-only compatibility repair for the Manus Ask-Founder request surface.
--
-- Source already accepts `manus` as a bounded founder-control request surface.
-- Keep provider schema aligned without rewriting historical migration identity.
-- This migration grants no execution authority and is intentionally unapplied
-- until the separate database-migration authority gate is satisfied.

alter table public.founder_permission_requests
  drop constraint if exists founder_permission_request_surface;
alter table public.founder_permission_requests
  add constraint founder_permission_request_surface
  check (requested_by_surface in ('fcr','chatgpt','claude','perplexity','manus'));

-- Decision provenance is still server-derived as `fcr` today, but the durable
-- enum membrane should remain compatible with the canonical surface registry
-- before a separately registered/attested adapter is introduced.
alter table public.founder_permission_requests
  drop constraint if exists founder_permission_decision_surface;
alter table public.founder_permission_requests
  add constraint founder_permission_decision_surface
  check (decision_surface is null or decision_surface in ('fcr','chatgpt','claude','perplexity','manus'));

comment on constraint founder_permission_request_surface on public.founder_permission_requests is
  'Canonical bounded founder-control request surfaces. Surface identity alone never grants execution authority.';
