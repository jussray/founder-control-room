-- Restrict service_role UPDATE on federated relay v3 public keys to the lifecycle columns.
-- Key identity and material (member, key_id, algorithm, public_key_jwk, valid_from,
-- created_at) and the database-owned timestamps (revoked_at, updated_at) are no longer
-- writable by service_role at the privilege layer. The lifecycle guard trigger still
-- enforces monotonic state transitions and sets revoked_at/updated_at itself; trigger
-- assignments are not subject to column privileges. SELECT and INSERT are unchanged.

revoke update on table public.federated_relay_public_keys from service_role;

grant update (state, valid_until)
  on table public.federated_relay_public_keys
  to service_role;
