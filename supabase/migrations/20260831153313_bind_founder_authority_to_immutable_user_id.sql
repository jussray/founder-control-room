-- Bind founder authority to an immutable auth.users id instead of the mutable JWT email claim.
--
-- Before: is_founder() matched founder_users.email against auth.jwt() ->> 'email'.
-- founder_users held a single unclaimed row with no corresponding auth account, and the
-- project had zero auth users. That made the row a dangling credential: whoever first
-- registered that address would inherit full founder access to every is_founder()-gated
-- table. The address is publicly discoverable (hardcoded in a public repo).
--
-- After: authority requires an explicit user_id binding; a matching email alone grants
-- nothing. Zero regression -- no auth users existed, so no one loses access. Founders are
-- bootstrapped by recording their auth.users id explicitly.

alter table public.founder_users
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists founder_users_user_id_key
  on public.founder_users(user_id) where user_id is not null;

-- Backfill any row that already has a real auth account (none at time of writing; safe no-op).
update public.founder_users fu
set user_id = u.id
from auth.users u
where fu.user_id is null and lower(u.email) = lower(fu.email);

create or replace function public.is_founder()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and coalesce((select auth.role()) = 'authenticated', false)
    and exists (
      select 1
      from public.founder_users fu
      where fu.user_id is not null
        and fu.user_id = (select auth.uid())
    );
$function$;
