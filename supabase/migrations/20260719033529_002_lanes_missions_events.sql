-- Founder Control Room — core schema
-- Lanes, missions, OODA steps, event inbox, evidence, escalations
-- Free-first: no paid Supabase features required

create extension if not exists "pgcrypto";

-- ─── Lanes ───────────────────────────────────────────────────────────────────
create table if not exists lanes (
  id          text primary key,
  label       text not null,
  status      text not null default 'active',
  risk        text not null default 'green' check (risk in ('green','yellow','red')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into lanes (id, label) values
  ('founder-os',       'Juss Founder OS'),
  ('sekret-bip',       'Se''kret Bip'),
  ('partner-project',  'Their Project')
on conflict do nothing;

-- ─── Missions ────────────────────────────────────────────────────────────────
create table if not exists missions (
  id                 uuid primary key default gen_random_uuid(),
  lane_id            text not null references lanes(id),
  title              text not null,
  objective          text not null,
  definition_of_done text[] not null default '{}',
  rollback           text[] not null default '{}',
  status             text not null default 'draft'
                       check (status in ('draft','active','blocked','done','cancelled')),
  risk               text not null default 'yellow'
                       check (risk in ('green','yellow','red')),
  next_action        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── OODA steps ──────────────────────────────────────────────────────────────
create table if not exists ooda_steps (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references missions(id) on delete cascade,
  phase       text not null check (phase in ('observe','orient','decide','act')),
  body        text not null,
  sort_order  int  not null default 0
);

-- ─── Events (inbox) ──────────────────────────────────────────────────────────
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  lane_id      text references lanes(id),
  event_type   text not null,
  payload      jsonb not null default '{}',
  processed    boolean not null default false,
  observed_at  timestamptz not null default now()
);

create index if not exists idx_events_unprocessed on events(processed, observed_at)
  where processed = false;

-- ─── Evidence ────────────────────────────────────────────────────────────────
create table if not exists evidence (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid references missions(id) on delete cascade,
  label       text not null,
  kind        text not null check (kind in ('log','screenshot','trace','metric','note')),
  verified    boolean not null default false,
  artifact    text,
  created_at  timestamptz not null default now()
);

-- ─── Stop/escalate log ───────────────────────────────────────────────────────
create table if not exists escalations (
  id          uuid primary key default gen_random_uuid(),
  lane_id     text references lanes(id),
  mission_id  uuid references missions(id),
  blocker     text not null,
  verified    text,
  safest_path text,
  needs       text,
  created_at  timestamptz not null default now()
);
