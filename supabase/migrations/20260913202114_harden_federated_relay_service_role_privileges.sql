-- Restore the least-privilege relay ledger contract after provider/default grants drift.
-- Relay messages are append-only through SECURITY DEFINER RPCs; service_role reads
-- them directly only for evidence/idempotency checks. Key registration/rotation
-- remains the only direct service-role table mutation surface.

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
