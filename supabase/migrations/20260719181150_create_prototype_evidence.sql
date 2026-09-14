-- Replay hardening extracted from historical source commit
-- 28913d661c9346ed92f13636eb6cb7a12ca3a74b (2026-07-19T18:11:50Z).
--
-- The production-applied migration 20260719033529_002_lanes_missions_events
-- historically attempted `create table if not exists evidence`. By its real
-- timestamp it runs after 20260711211416_reconciliation, so the canonical
-- reconciliation `evidence` table already exists and that historical create is
-- a no-op on a clean replay.
--
-- The later source hardening intentionally separated the unused prototype
-- artifact table from the canonical evidence table. Keep that later behavior
-- forward in time instead of rewriting the already-applied migration fossil.

create table if not exists prototype_evidence (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid references missions(id) on delete cascade,
  label       text not null,
  kind        text not null check (kind in ('log','screenshot','trace','metric','note')),
  verified    boolean not null default false,
  artifact    text,
  created_at  timestamptz not null default now()
);
