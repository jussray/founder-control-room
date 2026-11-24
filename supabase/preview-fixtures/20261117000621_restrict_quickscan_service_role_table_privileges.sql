-- Neon-only: model Supabase's broad default service_role table grants.
-- Executed atomically with the real forward migration on an isolated preview.
-- No production Supabase migration or provider grant is changed by this fixture.
grant all privileges on table public.quickscan_prospects, public.quickscan_stripe_events to service_role;

do $$
begin
  if not has_table_privilege('service_role', 'public.quickscan_prospects', 'TRUNCATE')
    or not has_table_privilege('service_role', 'public.quickscan_stripe_events', 'DELETE')
    or not has_table_privilege('service_role', 'public.quickscan_stripe_events', 'TRUNCATE') then
    raise exception 'Supabase default-grant simulation failed: expected broad privileges before hardening';
  end if;
end;
$$;
