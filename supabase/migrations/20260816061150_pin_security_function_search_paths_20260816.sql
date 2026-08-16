-- Keep repository migration truth aligned with the live Supabase hardening applied on 2026-08-16.
-- These functions are SECURITY INVOKER. Pinning search_path removes role-mutable name resolution
-- without changing their authorization or business behavior.

alter function public.update_onboarding_updated_at()
  set search_path = pg_catalog;

alter function stripe.check_rate_limit(text, integer, integer)
  set search_path = pg_catalog;

alter function stripe.set_updated_at()
  set search_path = pg_catalog;

alter function stripe.set_updated_at_metadata()
  set search_path = pg_catalog;
