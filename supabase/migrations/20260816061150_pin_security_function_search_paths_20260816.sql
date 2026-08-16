-- Keep repository migration truth aligned with the live Supabase hardening applied on 2026-08-16.
-- These functions are SECURITY INVOKER. Pinning search_path removes role-mutable name resolution
-- without changing their authorization or business behavior.
--
-- The stripe schema/functions are provider-managed and are not created by this repository's
-- clean local migration replay. Harden them when present; do not invent a fake local Stripe schema.

alter function public.update_onboarding_updated_at()
  set search_path = pg_catalog;

do $migration$
begin
  if to_regprocedure('stripe.check_rate_limit(text,integer,integer)') is not null then
    execute 'alter function stripe.check_rate_limit(text, integer, integer) set search_path = pg_catalog';
  end if;

  if to_regprocedure('stripe.set_updated_at()') is not null then
    execute 'alter function stripe.set_updated_at() set search_path = pg_catalog';
  end if;

  if to_regprocedure('stripe.set_updated_at_metadata()') is not null then
    execute 'alter function stripe.set_updated_at_metadata() set search_path = pg_catalog';
  end if;
end
$migration$;
