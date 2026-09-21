-- Harden Founder Control Room platform-founder authorization.
--
-- Keep the original workspace-tenancy migration immutable after preview
-- execution. This append-only correction replaces its temporary email-based
-- founder helper with immutable Supabase Auth user identity plus authenticated
-- role verification. Generic PostgreSQL previews remain fail-closed when the
-- complete Supabase auth helper surface is unavailable.

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'uid'
      and p.pronargs = 0
  )
  and exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'jwt'
      and p.pronargs = 0
  )
  and exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'role'
      and p.pronargs = 0
  ) then
    execute $function$
      create or replace function public.is_founder() returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select coalesce(
          (select auth.role()) = 'authenticated'
          and exists (
            select 1
            from public.founder_users fu
            where fu.user_id = (select auth.uid())
              and fu.account_role = 'platform_owner'
          ),
          false
        );
      $body$;
    $function$;
  else
    execute $function$
      create or replace function public.is_founder() returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select false;
      $body$;
    $function$;
  end if;
end
$$;
