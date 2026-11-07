-- Enable Row Level Security on every Control Room table, and add a
-- founder-auth policy so the founder's OWN Supabase Auth identity in THIS
-- project (never Bip's consumer auth) can access data directly, in
-- addition to the backend's service-role key (which already bypasses RLS).
--
-- Design: founder identity is matched by email claim on the JWT, not by a
-- pre-existing auth.users row. This means the policy works the moment the
-- founder signs in (magic link / OAuth) with an allowlisted email — no
-- manual auth.users insert required.

create table if not exists founder_users (
  email text primary key,
  created_at timestamptz not null default now()
);

comment on table founder_users is 'Allowlist of founder emails. Matched against the JWT email claim, not auth.users.id, so it works before/after the founder''s first sign-in.';

alter table founder_users enable row level security;
-- No anon/authenticated policies on founder_users itself — only the
-- service-role key (which bypasses RLS) can read/write this allowlist.
-- This is intentional: founders can't add themselves.

create or replace function is_founder() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from founder_users
      where email = (auth.jwt() ->> 'email')
    ),
    false
  );
$$;

-- Enable RLS on every Control Room table.
alter table projects enable row level security;
alter table project_connections enable row level security;
alter table project_events enable row level security;
alter table missions enable row level security;
alter table change_proposals enable row level security;
alter table approvals enable row level security;
alter table agent_runs enable row level security;
alter table council_conversations enable row level security;
alter table agent_costs enable row level security;
alter table releases enable row level security;
alter table promptos_templates enable row level security;
alter table promptos_template_versions enable row level security;
alter table issue_summaries enable row level security;

-- One founder-full-access policy per table. Service role still bypasses
-- RLS entirely, so this only affects requests made with a founder's own
-- Supabase session (e.g. the Control Room UI signed in directly).
create policy founder_full_access on projects for all using (is_founder()) with check (is_founder());
create policy founder_full_access on project_connections for all using (is_founder()) with check (is_founder());
create policy founder_full_access on project_events for all using (is_founder()) with check (is_founder());
create policy founder_full_access on missions for all using (is_founder()) with check (is_founder());
create policy founder_full_access on change_proposals for all using (is_founder()) with check (is_founder());
create policy founder_full_access on approvals for all using (is_founder()) with check (is_founder());
create policy founder_full_access on agent_runs for all using (is_founder()) with check (is_founder());
create policy founder_full_access on council_conversations for all using (is_founder()) with check (is_founder());
create policy founder_full_access on agent_costs for all using (is_founder()) with check (is_founder());
create policy founder_full_access on releases for all using (is_founder()) with check (is_founder());
create policy founder_full_access on promptos_templates for all using (is_founder()) with check (is_founder());
create policy founder_full_access on promptos_template_versions for all using (is_founder()) with check (is_founder());
create policy founder_full_access on issue_summaries for all using (is_founder()) with check (is_founder());

-- Seed the founder allowlist.
insert into founder_users (email) values ('mcgill.raylene@gmail.com')
on conflict (email) do nothing;
