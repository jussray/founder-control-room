import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { FounderPermissionFederatedRelayKeyTarget } from '../founderPermissionBroker.js';
import { registerFederatedRelayPublicKey } from '../federatedRelayKeyRegistration.js';

const jwk = { kty: 'OKP' as const, crv: 'Ed25519' as const, x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
const target: FounderPermissionFederatedRelayKeyTarget = {
  type: 'federated_relay_public_key_register',
  member: 'promptos',
  keyId: 'promptos-effect-test-001',
  algorithm: 'Ed25519',
  publicKeyJwk: jwk,
  publicKeyHash: createHash('sha256').update(JSON.stringify(jwk)).digest('hex'),
  validFrom: '2026-11-26T00:00:00.000Z',
  validUntil: null,
  providerIdentity: 'supabase:fcr',
  capabilityVersion: 'fcr-federated-relay-key-registration@v1',
  consequence: 'CONSEQUENTIAL_WRITE',
};

function database(options: { ambiguousInsert?: boolean; existing?: Record<string, unknown> } = {}) {
  let row: Record<string, unknown> | null = options.existing ?? null;
  const db = {
    from(table: string) {
      if (table !== 'federated_relay_public_keys') throw new Error('unexpected table');
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return { maybeSingle: async () => ({ data: row?.key_id === value ? row : null, error: null }) };
            },
          };
        },
        insert(values: Record<string, unknown>) {
          return {
            select() {
              return {
                single: async () => {
                  row = {
                    ...values,
                    revoked_at: null,
                    created_at: '2026-11-26T00:01:00.000Z',
                  };
                  return options.ambiguousInsert
                    ? { data: null, error: { code: 'ETIMEDOUT' } }
                    : { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return db as unknown as Pick<SupabaseClient, 'from'>;
}

describe('Federated relay key registration effect', () => {
  it('inserts and verifies an exact PromptOS key', async () => {
    const result = await registerFederatedRelayPublicKey(target, database());
    expect(result.disposition).toBe('REGISTERED');
    expect(result.outcomeVerified).toBe(true);
    expect(result.executionAuthorized).toBe(false);
    expect(result.publicKeyHash).toBe(target.publicKeyHash);
  });

  it('returns an idempotent receipt for an already registered exact key', async () => {
    const db = database();
    const first = await registerFederatedRelayPublicKey(target, db);
    const second = await registerFederatedRelayPublicKey(target, db);
    expect(first.disposition).toBe('REGISTERED');
    expect(second.disposition).toBe('ALREADY_REGISTERED');
  });

  it('reconciles an ambiguous insert response by reading back the exact row', async () => {
    const result = await registerFederatedRelayPublicKey(target, database({ ambiguousInsert: true }));
    expect(result.disposition).toBe('ALREADY_REGISTERED');
    expect(result.outcomeVerified).toBe(true);
  });

  it('refuses a key ID already bound to different public material', async () => {
    const conflicting = {
      key_id: target.keyId,
      member: 'promptos',
      algorithm: 'Ed25519',
      public_key_jwk: { ...jwk, x: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
      state: 'active',
      valid_from: target.validFrom,
      valid_until: null,
      revoked_at: null,
      created_at: '2026-11-26T00:01:00.000Z',
    };
    await expect(registerFederatedRelayPublicKey(target, database({ existing: conflicting })))
      .rejects.toThrow('FCR_RELAY_KEY_ID_CONFLICT');
  });
});
