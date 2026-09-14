-- Hardening pass from Supabase advisor output after 0002:
--
-- 1. set_updated_at() had a mutable search_path (WARN) — pin it.
-- 2. is_founder() was executable by `anon`/`authenticated` via
--    /rest/v1/rpc/is_founder directly (WARN). It only needs to run as part
--    of RLS policy evaluation for the `authenticated` role — anon has no
--    policies referencing it at all, so anon's EXECUTE grant is dropped
--    entirely and authenticated keeps only what's needed for policies to work.
--
-- Note: `founder_users` having RLS enabled with zero policies is
-- intentional (INFO, not WARN) — that's what makes it service-role-only.
-- Not fixing that; it's the correct state.

create or replace function set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function is_founder() from public;
revoke execute on function is_founder() from anon;
grant execute on function is_founder() to authenticated;
