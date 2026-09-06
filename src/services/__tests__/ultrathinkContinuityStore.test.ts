import { describe, expect, it } from 'vitest';
import {
  createUltrathinkContinuityRecord,
  inspectUltrathinkContinuity,
  type ContinuityRevocation,
  type UltrathinkContinuityRecord,
} from '../../lib/ultrathinkContinuity.js';
import {
  revokeUltrathinkContinuity,
  storeUltrathinkContinuity,
  type ContinuityStoreDisposition,
  type UltrathinkContinuityStore,
} from '../ultrathinkContinuityStore.js';

const SHA = 'a'.repeat(40);
const HASH = `sha256:${'a'.repeat(64)}`;

function checkpoint(id: string, parent: UltrathinkContinuityRecord | null = null) {
  return createUltrathinkContinuityRecord({
    namespace: 'fcr',
    missionId: 'CONTINUITY-V1',
    continuationId: id,
    parent: parent ? { continuationId: parent.continuationId, stateHash: parent.stateHash } : null,
    createdAt: '2026-09-05T15:00:00.000Z',
    createdBy: 'founder:jussray',
    freshnessPolicyMs: 60 * 60 * 1000,
    observedAt: '2026-09-05T15:00:00.000Z',
    authorityIdentity: {
      repo: 'jussray/founder-control-room',
      branch: 'main',
      sha: SHA,
      runtime: null,
      externalRef: null,
    },
    evidenceRefs: [{ kind: 'github', ref: `github:fcr:${id}`, checksum: HASH }],
    historicalReceiptStatus: 'verified',
    truthPlane: 'source',
  });
}

class MemoryStore implements UltrathinkContinuityStore {
  records = new Map<string, UltrathinkContinuityRecord>();
  revocations = new Map<string, ContinuityRevocation>();

  async persist(record: UltrathinkContinuityRecord): Promise<ContinuityStoreDisposition> {
    if (this.records.has(record.continuationId)) return 'duplicate';
    this.records.set(record.continuationId, record);
    return 'stored';
  }
  async get(id: string) { return this.records.get(id) ?? null; }
  async children(parentId: string) { return [...this.records.values()].filter((record) => record.parentContinuationId === parentId); }
  async getRevocation(id: string) { return this.revocations.get(id) ?? null; }
  async persistRevocation(id: string, revocation: ContinuityRevocation): Promise<ContinuityStoreDisposition> {
    const existing = this.revocations.get(id);
    if (existing) return JSON.stringify(existing) === JSON.stringify(revocation) ? 'duplicate' : 'conflict';
    this.revocations.set(id, revocation);
    return 'stored';
  }
}

describe('ULTRATHINK continuity persistence boundary', () => {
  it('stores and retrieves one append-only non-mutating continuity record', async () => {
    const store = new MemoryStore();
    const value = checkpoint('CNT-001');

    await expect(storeUltrathinkContinuity(value, store)).resolves.toBe('stored');
    await expect(store.get(value.continuationId)).resolves.toEqual(value);
    expect(value.executionAuthority).toBe(false);
  });

  it('rejects replay when a continuation id already exists', async () => {
    const store = new MemoryStore();
    const value = checkpoint('CNT-REPLAY');
    await storeUltrathinkContinuity(value, store);

    await expect(storeUltrathinkContinuity(value, store)).rejects.toThrow('ULTRATHINK_CONTINUITY_REPLAY_REJECTED');
  });

  it('appends revocation without mutating historical receipt truth', async () => {
    const store = new MemoryStore();
    const value = checkpoint('CNT-REVOKE');
    await storeUltrathinkContinuity(value, store);

    await expect(revokeUltrathinkContinuity(value.continuationId, {
      revokedAt: '2026-09-05T15:30:00.000Z',
      revokedBy: 'founder:jussray',
      reason: 'invalid checkpoint for future continuation',
    }, store)).resolves.toBe('stored');

    const original = await store.get(value.continuationId);
    expect(original?.historicalReceiptStatus).toBe('verified');
    expect(original?.stateHash).toBe(value.stateHash);

    const inspected = await inspectUltrathinkContinuity(store, value.continuationId, {
      namespace: 'fcr', missionId: 'CONTINUITY-V1', now: new Date('2026-09-05T15:40:00.000Z'),
    });
    expect(inspected.classification).toBe('REVOKED');
    expect(inspected.historicalReceiptStatus).toBe('verified');
  });

  it('blocks restoration through a revoked ancestor', async () => {
    const store = new MemoryStore();
    const parent = checkpoint('CNT-PARENT');
    const child = checkpoint('CNT-CHILD', parent);
    await storeUltrathinkContinuity(parent, store);
    await storeUltrathinkContinuity(child, store);
    await revokeUltrathinkContinuity(parent.continuationId, {
      revokedAt: '2026-09-05T15:20:00.000Z',
      revokedBy: 'founder:jussray',
      reason: 'parent checkpoint revoked',
    }, store);

    const inspected = await inspectUltrathinkContinuity(store, child.continuationId, {
      namespace: 'fcr', missionId: 'CONTINUITY-V1', now: new Date('2026-09-05T15:40:00.000Z'),
    });
    expect(inspected.classification).toBe('REVOKED');
    expect(inspected.reasons).toContain('revoked_ancestor');
    expect(inspected.continuityMayAuthorizeAction).toBe(false);
  });
});
