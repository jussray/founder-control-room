-- Canonical Founder OS + standing slash-command registry snapshots.
-- Identity is immutable metadata; implementation/runtime/outcome status belongs to separate truth planes.

create table if not exists public.founder_os_registry_snapshots (
  registry_hash text primary key
    check (registry_hash ~ '^[0-9a-f]{64}$'),
  contract text not null default 'juss/fcr-os-registry-snapshot@v1'
    check (contract = 'juss/fcr-os-registry-snapshot@v1'),
  source_repository text not null
    check (source_repository = 'jussray/founder-control-room'),
  source_commit_sha text not null
    check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'retired')),
  os_entries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(os_entries) = 'array'),
  command_entries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(command_entries) = 'array'),
  approved_by text,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'approved' and approved_by is not null and approved_at is not null and retired_at is null)
    or status = 'candidate'
    or (status = 'retired' and retired_at is not null)
  )
);

comment on table public.founder_os_registry_snapshots is
  'Server-owned immutable snapshots of Founder Control Room OS identity and standing command routing. OS identity is separate from implementation/runtime/outcome proof. Command presence never grants execution authority.';

comment on column public.founder_os_registry_snapshots.os_entries is
  'Operating-system identity only: id, parent, North Star, and identity lock. Runtime status belongs to truth/proof stores.';

comment on column public.founder_os_registry_snapshots.command_entries is
  'Standing command identity, aliases, owning OS, trigger contract, and authority ceiling. Manual invocation is optional emphasis/override.';

create unique index if not exists founder_os_registry_one_approved
  on public.founder_os_registry_snapshots (contract)
  where status = 'approved';

alter table public.founder_os_registry_snapshots enable row level security;

revoke all on table public.founder_os_registry_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.founder_os_registry_snapshots to service_role;

drop policy if exists founder_os_registry_deny_clients on public.founder_os_registry_snapshots;
create policy founder_os_registry_deny_clients
  on public.founder_os_registry_snapshots
  for all
  to anon, authenticated
  using (false)
  with check (false);
