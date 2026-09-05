import { describe, expect, it } from 'vitest';
import {
  createUltrathinkContinuityRecord,
  inspectUltrathinkContinuity,
  type ContinuityReader,
  type ContinuityRevocation,
  type UltrathinkContinuityRecord,
} from '../ultrathinkContinuity.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const NOW = new Date('2026-09-05T16:00:00.000Z');

function record(
  continuationId: string,
  overrides: Partial<Parameters<typeof createUltrathinkContinuityRecord>[0]> = {},
): UltrathinkContinuityRecord {
  return createUltrathinkContinuityRecord({
    namespace: 'chief',
    missionId: 'CHIEF-143',
    continuationId,
    parent: null,
    createdAt: '2026-09-05T15:00:00.000Z',
    createdBy: 'founder:jussray',
    freshnessPolicyMs: 60 * 60 * 1000,
    observedAt: '2026-09-05T15:00:00.000Z',
    authorityIdentity: {
      repo: 'jussray/chief-ai-machine',
      branch: 'main',
      sha: SHA_A,
      runtime: null,
      externalRef: null,
    },
    evidenceRefs: [{ kind: 'github', ref: 'github:chief:143', checksum: HASH_A }],
    crossSystemLinks: [{
      targetNamespace: 'fcr',
      relationship: 'execution_receipt',
      authorityScope: 'evidence',
      continuationAllowed: false,
    }],
    historicalReceiptStatus: 'verified',
    truthPlane: 'execution',
    ...overrides,
  });
}

class MemoryReader implements ContinuityReader {
  records = new Map<string, UltrathinkContinuityRecord>();
  revocations = new Map<string, ContinuityRevocation>();

  constructor(records: readonly UltrathinkContinuityRecord[]) {
    for (const item of records) this.records.set(item.continuationId, item);
  }

  async get(id: string) { return this.records.get(id) ?? null; }
  async children(parentId: string) { return [...this.records.values()].filter((item) => item.parentContinuationId === parentId); }
  async getRevocation(id: string) { return this.revocations.get(id) ?? null; }
}

describe('ULTRATHINK non-mutating continuity core', () => {
  it('creates deterministic non-authorizing proof cookies and continuity records', () => {
    const first = record('CNT-001');
    const second = record('CNT-001');

    expect(first).toEqual(second);
    expect(first.stateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.proofCookie.cookieHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.proofCookie.browserCookie).toBe(false);
    expect(first.proofCookie.actionAuthority).toBe(false);
    expect(first.executionAuthority).toBe(false);
    expect(first.crossSystemLinks[0]).toMatchObject({
      targetNamespace: 'fcr',
      continuationAllowed: false,
    });
  });

  it('fails closed when any stored record is tampered after hashing', async () => {
    const original = record('CNT-001');
    const tampered = {
      ...original,
      authorityIdentity: { ...original.authorityIdentity, sha: SHA_B },
    } as UltrathinkContinuityRecord;
    const result = await inspectUltrathinkContinuity(new MemoryReader([tampered]), tampered.continuationId, {
      namespace: 'chief', missionId: 'CHIEF-143', now: NOW,
    });

    expect(result.classification).toBe('BLOCKED');
    expect(result.reasons).toContain('continuity state hash mismatch');
    expect(result.continuityMayAuthorizeAction).toBe(false);
  });

  it('detects two children of one parent as a divergent continuation fork', async () => {
    const parent = record('CNT-ROOT');
    const left = record('CNT-LEFT', {
      parent: { continuationId: parent.continuationId, stateHash: parent.stateHash },
      evidenceRefs: [{ kind: 'github', ref: 'github:chief:left', checksum: HASH_A }],
    });
    const right = record('CNT-RIGHT', {
      parent: { continuationId: parent.continuationId, stateHash: parent.stateHash },
      evidenceRefs: [{ kind: 'github', ref: 'github:chief:right', checksum: HASH_B }],
    });
    const result = await inspectUltrathinkContinuity(new MemoryReader([parent, left, right]), left.continuationId, {
      namespace: 'chief', missionId: 'CHIEF-143', now: NOW,
    });

    expect(result.classification).toBe('DIVERGED');
    expect(result.forkedParentIds).toEqual(['CNT-ROOT']);
  });

  it('blocks continuation through a revoked checkpoint without erasing its verified historical receipt', async () => {
    const checkpoint = record('CNT-REV');
    const reader = new MemoryReader([checkpoint]);
    reader.revocations.set(checkpoint.continuationId, {
      revokedAt: '2026-09-05T15:30:00.000Z',
      revokedBy: 'founder:jussray',
      reason: 'checkpoint superseded by current founder decision',
    });
    const result = await inspectUltrathinkContinuity(reader, checkpoint.continuationId, {
      namespace: 'chief', missionId: 'CHIEF-143', now: NOW,
    });

    expect(result.classification).toBe('REVOKED');
    expect(result.historicalReceiptStatus).toBe('verified');
    expect(result.continuityMayAuthorizeAction).toBe(false);
  });

  it('marks an expired record stale when no fresh authority observation is supplied', async () => {
    const checkpoint = record('CNT-STALE', { freshnessPolicyMs: 5 * 60 * 1000 });
    const result = await inspectUltrathinkContinuity(new MemoryReader([checkpoint]), checkpoint.continuationId, {
      namespace: 'chief', missionId: 'CHIEF-143', now: NOW,
    });

    expect(result.classification).toBe('STALE');
    expect(result.reasons).toContain('freshness_lease_expired');
  });

  it('re-observes unchanged current authority instead of letting old freshness erase historical truth', async () => {
    const checkpoint = record('CNT-REFRESH', { freshnessPolicyMs: 5 * 60 * 1000 });
    const result = await inspectUltrathinkContinuity(new MemoryReader([checkpoint]), checkpoint.continuationId, {
      namespace: 'chief',
      missionId: 'CHIEF-143',
      now: NOW,
      currentAuthority: {
        authorityIdentity: checkpoint.authorityIdentity,
        observedAt: NOW.toISOString(),
        relation: 'same',
      },
    });

    expect(result.classification).toBe('UNCHANGED');
    expect(result.historicalReceiptStatus).toBe('verified');
  });

  it('classifies proven forward authority movement as ADVANCED and never as inherited authorization', async () => {
    const checkpoint = record('CNT-ADV');
    const result = await inspectUltrathinkContinuity(new MemoryReader([checkpoint]), checkpoint.continuationId, {
      namespace: 'chief',
      missionId: 'CHIEF-143',
      currentAuthority: {
        authorityIdentity: { ...checkpoint.authorityIdentity, sha: SHA_B },
        observedAt: NOW.toISOString(),
        relation: 'advanced',
      },
      now: NOW,
    });

    expect(result.classification).toBe('ADVANCED');
    expect(result.continuityMayAuthorizeAction).toBe(false);
  });

  it('rejects secret-shaped material before a continuity record can be created', () => {
    expect(() => record('CNT-SECRET', {
      evidenceRefs: [{
        kind: 'provider',
        ref: 'token:ghp_abcdefghijklmnopqrstuvwxyz0123456789',
        checksum: HASH_A,
      }],
    })).toThrow(/SECRET_REJECTED|evidence ref invalid/);
  });

  it('blocks missing evidence and reports checksum conflicts when an independent resolver is supplied', async () => {
    const checkpoint = record('CNT-EVIDENCE');
    const missing = await inspectUltrathinkContinuity(new MemoryReader([checkpoint]), checkpoint.continuationId, {
      namespace: 'chief', missionId: 'CHIEF-143', now: NOW,
      evidenceResolver: { checksum: async () => null },
    });
    expect(missing.classification).toBe('BLOCKED');
    expect(missing.reasons[0]).toMatch(/^evidence_missing:/);

    const conflicting = await inspectUltrathinkContinuity(new MemoryReader([checkpoint]), checkpoint.continuationId, {
      namespace: 'chief', missionId: 'CHIEF-143', now: NOW,
      evidenceResolver: { checksum: async () => HASH_B },
    });
    expect(conflicting.classification).toBe('CONFLICTING');
    expect(conflicting.reasons[0]).toMatch(/^evidence_checksum_mismatch:/);
  });

  it('keeps cross-system evidence readable without transferring continuation or action authority', () => {
    const checkpoint = record('CNT-CROSS');
    expect(checkpoint.crossSystemLinks).toEqual([{
      targetNamespace: 'fcr',
      relationship: 'execution_receipt',
      authorityScope: 'evidence',
      continuationAllowed: false,
    }]);
    expect(checkpoint.executionAuthority).toBe(false);
    expect(checkpoint.proofCookie.actionAuthority).toBe(false);
  });
});
