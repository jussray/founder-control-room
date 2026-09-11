import { describe, expect, it } from 'vitest';
import {
  hashApprovalPayload,
  validateApprovalExecution,
  type ApprovalBinding,
} from '../approvals/approval.js';
import {
  CRYPTOGRAPHIC_INVENTORY,
  cryptographicInventorySnapshot,
} from './cryptographicInventory.js';
import { buildSecurityPostureSnapshot } from './securityPosture.js';

const AFTER_STATIC_LEASE = Date.parse('2026-09-11T01:18:31.000Z');

function approvalBinding(payload: unknown): ApprovalBinding {
  return {
    approvalId: 'approval-json-1',
    actorId: 'founder-1',
    action: 'provider_write',
    payloadHash: hashApprovalPayload(payload),
    targetId: 'provider-target',
    targetFingerprint: 'sha:abc',
    providerCapability: 'provider_write',
    projectId: 'fcr',
    branch: 'main',
    riskClass: 'high',
    expiration: '2026-09-12T00:00:00Z',
    rollbackReference: 'rollback-1',
    idempotencyKey: 'idem-json-1',
    createdAt: '2026-09-11T00:00:00Z',
    status: 'approved_once',
  };
}

describe('provenance recovery P2 contracts', () => {
  it('pins every cryptographic observation to an inspected revision and expires static evidence', () => {
    for (const entry of CRYPTOGRAPHIC_INVENTORY) {
      expect(entry.sourceRevision).toMatch(/^[0-9a-f]{40}$/);
      expect(Number.isFinite(Date.parse(entry.observedAt))).toBe(true);
      expect(Number.isFinite(Date.parse(entry.freshnessExpiresAt))).toBe(true);
    }

    const stale = cryptographicInventorySnapshot(AFTER_STATIC_LEASE);
    expect(stale).toHaveLength(CRYPTOGRAPHIC_INVENTORY.length);
    expect(stale.every((entry) => entry.observationState === 'STALE')).toBe(true);
    expect(stale.every((entry) => entry.staleReason?.includes('revalidate the exact source revision'))).toBe(true);

    const posture = buildSecurityPostureSnapshot(AFTER_STATIC_LEASE);
    expect(posture.cryptography.inventory.every((entry) => entry.observationState === 'STALE')).toBe(true);
  });

  it('preserves canonical key ordering for plain JSON approval payloads', () => {
    expect(hashApprovalPayload({ z: 2, a: { y: 1, x: true } }))
      .toBe(hashApprovalPayload({ a: { x: true, y: 1 }, z: 2 }));
  });

  it('rejects Date and other non-plain objects instead of hashing them as empty objects', () => {
    expect(() => hashApprovalPayload({ when: new Date('2026-09-11T00:00:00Z') }))
      .toThrow(/plain JSON objects/);

    const approvedPayload = { when: '2026-09-11T00:00:00.000Z' };
    const binding = approvalBinding(approvedPayload);
    expect(validateApprovalExecution(binding, {
      actorId: binding.actorId,
      action: binding.action,
      payload: { when: new Date('2026-09-11T00:00:00Z') },
      targetId: binding.targetId,
      targetFingerprint: binding.targetFingerprint,
      providerCapability: binding.providerCapability,
      projectId: binding.projectId,
      branch: binding.branch,
      now: '2026-09-11T01:00:00Z',
    })).toEqual({ ok: false, code: 'payload_invalid' });
  });
});
