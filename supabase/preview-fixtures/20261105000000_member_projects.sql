-- Ephemeral Neon compatibility fixture only; never a live migration.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('CREATE ROLE %I NOLOGIN', role_name);
    end if;
  end loop;
end;
$$;
