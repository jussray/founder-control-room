import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const historicalPath = resolve(
  repositoryRoot,
  'supabase/migrations/20260913202114_harden_federated_relay_service_role_privileges.sql',
);
const hardeningPath = resolve(
  repositoryRoot,
  'supabase/migrations/20260914035500_harden_federated_relay_v3_key_lifecycle.sql',
);
const historical = readFileSync(historicalPath, 'utf8');
const hardening = readFileSync(hardeningPath, 'utf8').toLowerCase();

const expectedHistorical = `-- Restore the least-privilege relay ledger contract after provider/default grants drift.
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
`;

describe('federated relay v3 key lifecycle hardening', () => {
  it('preserves the production-recorded migration fossil byte-for-byte', () => {
    expect(historical).toBe(expectedHistorical);
  });

  it('narrows service_role updates to lifecycle columns only', () => {
    expect(hardening).toContain(
      'revoke update on table public.federated_relay_public_keys from service_role;',
    );
    expect(hardening).toContain('grant update (state, valid_until)');
    expect(hardening).not.toContain('grant update (state, valid_until, revoked_at)');
    for (const immutable of ['member', 'key_id', 'algorithm', 'public_key_jwk', 'valid_from', 'created_at']) {
      expect(hardening).toContain(`new.${immutable} is distinct from old.${immutable}`);
    }
  });

  it('makes retirement, revocation, and bounded validity monotonic with database-owned timestamps', () => {
    expect(hardening).toContain("old.state = 'revoked' and new.state <> 'revoked'");
    expect(hardening).toContain("old.state = 'retired' and new.state = 'active'");
    expect(hardening).toContain('old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at');
    expect(hardening).toContain('old.valid_until is not null and new.valid_until is distinct from old.valid_until');
    expect(hardening).toContain('new.valid_until <= clock_timestamp()');
    expect(hardening).toContain('new.revoked_at := clock_timestamp();');
    expect(hardening).toContain('new.updated_at := clock_timestamp();');
  });

  it('installs a row-level guard and does not expose the trigger function as an RPC', () => {
    expect(hardening).toContain('create trigger federated_relay_public_keys_lifecycle_guard_v3');
    expect(hardening).toContain('before update on public.federated_relay_public_keys');
    expect(hardening).toContain('for each row execute function public.guard_federated_relay_public_key_lifecycle_v3();');
    expect(hardening).toContain(
      'revoke all on function public.guard_federated_relay_public_key_lifecycle_v3()',
    );
  });
});
