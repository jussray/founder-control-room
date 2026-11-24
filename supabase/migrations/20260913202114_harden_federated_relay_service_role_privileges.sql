-- Reconcile the production-applied relay service-role privilege hardening into source.
-- Production recorded this exact migration version as 20260913202114.
-- Keep the SQL here so fresh databases reproduce the live least-privilege state.

revoke all privileges on table public.federated_relay_public_keys from service_role;
revoke all privileges on table public.federated_relay_sequence_counters from service_role;
revoke all privileges on table public.federated_relay_messages from service_role;
revoke all privileges on table public.federated_relay_reply_reservations from service_role;

grant select, insert, update
  on table public.federated_relay_public_keys
  to service_role;

grant select
  on table public.federated_relay_messages
  to service_role;
