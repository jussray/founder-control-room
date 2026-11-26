import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFounderPermissionRequest } from '../founderPermissionBroker.js';

const publicKeyJwk = {
  kty: 'OKP' as const,
  crv: 'Ed25519' as const,
  x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};
const publicKeyHash = createHash('sha256').update(JSON.stringify(publicKeyJwk)).digest('hex');

function request(overrides: Record<string, unknown> = {}) {
  return createFounderPermissionRequest({
    requestId: 'relay-key:promptos-test-001',
    requestedBySurface: 'chatgpt',
    proposal: {
      proposalId: 'federated-relay-key-promptos-test-001',
      proposalHash: publicKeyHash,
      projectSlug: 'promptos',
      actionType: 'federated_relay_public_key_register',
      expectedHeadSha: null,
      capabilityPlanHash: null,
    },
    actionTarget: {
      type: 'federated_relay_public_key_register',
      member: 'promptos',
      keyId: 'promptos-test-key-001',
      algorithm: 'Ed25519',
      publicKeyJwk,
      publicKeyHash,
      validFrom: '2026-11-26T00:00:00.000Z',
      validUntil: null,
      providerIdentity: 'supabase:fcr',
      capabilityVersion: 'fcr-federated-relay-key-registration@v1',
      consequence: 'CONSEQUENTIAL_WRITE',
      ...overrides,
    } as never,
  });
}

describe('Founder-gated federated relay public-key registration', () => {
  it('binds exact PromptOS public key material and validity to one request hash', () => {
    const value = request();
    expect(value.actionTarget).toMatchObject({
      type: 'federated_relay_public_key_register',
      member: 'promptos',
      keyId: 'promptos-test-key-001',
      algorithm: 'Ed25519',
      publicKeyHash,
      validFrom: '2026-11-26T00:00:00.000Z',
      validUntil: null,
    });
    expect(value.requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects private JWK material', () => {
    expect(() => request({ publicKeyJwk: { ...publicKeyJwk, d: 'private' } }))
      .toThrow(/public-only Ed25519 JWK/);
  });

  it('rejects an altered public-key digest', () => {
    expect(() => request({ publicKeyHash: 'f'.repeat(64) }))
      .toThrow(/exact public-key digest/);
  });

  it('rejects a validity window that ends before it begins', () => {
    expect(() => request({ validUntil: '2026-11-25T00:00:00.000Z' }))
      .toThrow(/later than validFrom/);
  });

  it('rejects a non-PromptOS member or noncanonical provider', () => {
    expect(() => request({ member: 'chief-ai-machine' }))
      .toThrow(/restricted to PromptOS/);
    expect(() => request({ providerIdentity: 'supabase:other' }))
      .toThrow(/canonical FCR provider/);
  });
});
