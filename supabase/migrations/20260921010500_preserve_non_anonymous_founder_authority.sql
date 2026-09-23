-- Preserve the live FCR founder-authentication invariants while adding the
-- workspace platform-owner boundary introduced by PR #784.
--
-- The current production helper rejects anonymous Supabase sessions and binds
-- authority to auth.uid(). Keep both properties, then additionally require the
-- workspace migration's platform_owner role. Generic PostgreSQL previews remain
-- fail-closed when the complete Supabase auth helper surface is unavailable.

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
        select
          coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
          and coalesce((select auth.role()) = 'authenticated', false)
          and exists (
            select 1
            from public.founder_users fu
            where fu.user_id = (select auth.uid())
              and fu.account_role = 'platform_owner'
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
