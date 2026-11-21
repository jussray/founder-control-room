-- Forward-only hardening after the production-applied QuickScan durable-store migration.
-- Supabase's default public-table ACL grants service_role ALL privileges.
-- Positive-only grants in 20261116072046 do not remove that inherited default.
-- Restrict these two tables without rewriting recorded migration history.
begin;

revoke all on table public.quickscan_prospects from service_role;
revoke all on table public.quickscan_stripe_events from service_role;

grant select, insert, update, delete on table public.quickscan_prospects to service_role;
grant select, insert, update on table public.quickscan_stripe_events to service_role;

commit;
