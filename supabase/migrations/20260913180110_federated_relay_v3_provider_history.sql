-- Provider-history reconciliation marker.
--
-- The durable federated relay v3 schema was first applied to the live FCR
-- Supabase project through the provider API, which recorded migration version
-- 20260913180110. The canonical schema itself is already represented by
-- 20260913180000_federated_relay_v3.sql, so this migration intentionally makes
-- no schema change. Keeping the exact provider-issued version in source makes
-- fresh previews and production migration history comparable without replaying
-- the schema mutation.

select 1;
