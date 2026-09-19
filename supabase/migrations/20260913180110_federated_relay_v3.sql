-- Provider-history reconciliation marker.
--
-- The durable federated relay v3 schema was first applied to the live FCR
-- Supabase project through the provider API, which recorded migration version
-- 20260913180110 with migration name federated_relay_v3. The canonical schema
-- itself is already represented by 20260913180000_federated_relay_v3.sql, so
-- this exact provider-history marker intentionally makes no schema change.

select 1;
