-- Keep founder authorization inside the trusted Control Room backend.
-- Browser roles cannot call this function directly.

create or replace function public.is_founder()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and coalesce((select auth.role()) = 'authenticated', false)
    and exists (
      select 1
      from public.founder_users fu
      where lower(fu.email) = lower((select auth.jwt()) ->> 'email')
    );
$$;

revoke all on function public.is_founder() from public, anon, authenticated;
grant execute on function public.is_founder() to service_role;

comment on function public.is_founder() is
  'Internal founder predicate. Anonymous-authenticated sessions are rejected; direct browser execution is disabled.';
