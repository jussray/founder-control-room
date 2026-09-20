-- Preserve the immutable workspace-foundation migration history while carrying
-- the later founder-authority hardening forward as an append-only change.
--
-- Historical founder_full_access policies call public.is_founder(). Authority
-- must bind to the authenticated Supabase user id, never to mutable email
-- metadata. Generic PostgreSQL previews do not expose Supabase auth helpers, so
-- they retain a deny-all implementation rather than fabricating auth state.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'uid'
      and p.pronargs = 0
  ) and exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'jwt'
      and p.pronargs = 0
  ) and exists (
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
      set search_path = public, auth
      as $body$
        select
          coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
          and coalesce((select auth.role()) = 'authenticated', false)
          and exists (
            select 1
            from public.founder_users fu
            where fu.user_id is not null
              and fu.user_id = (select auth.uid())
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
