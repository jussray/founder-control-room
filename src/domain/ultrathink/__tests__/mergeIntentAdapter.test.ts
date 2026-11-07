import { describe, expect, it } from 'vitest';
import { evaluateAuthorityLease } from '../coreContract.js';
import { mergeIntentToUltrathinkContract } from '../mergeIntentAdapter.js';

const intent = {
  missionId: 'mission-1',
  projectId: 'project-1',
  targetBranch: 'main',
  approvedBaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  approvedHeadSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  approvalProofId: 'proof-1',
  approvedBy: 'founder',
  proofExpiresAt: '2026-08-22T23:30:00.000Z',
  revision: 2,
};

const proof = {
  id: 'proof-1',
  status: 'pass' as const,
  ranAt: '2026-08-22T23:10:00.000Z',
};

describe('merge intent ULTRATHINK adapter', () => {
  it('preserves exact merge candidate and target identity', () => {
    const contract = mergeIntentToUltrathinkContract(intent, proof);
    expect(contract.identity).toEqual({
      kind: 'merge',
      projectId: 'project-1',
      resourceId: 'mission-1',
      target: 'main@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      candidate: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  it('preserves proof identity, founder authority, expiry, and revision', () => {
    const contract = mergeIntentToUltrathinkContract(intent, proof);
    expect(contract.evidence[0]).toMatchObject({ id: 'proof-1', gateId: 'merge', state: 'pass' });
    expect(contract.authority).toEqual({
      approvedBy: 'founder',
      expiresAt: '2026-08-22T23:30:00.000Z',
      revision: 2,
    });
  });

  it('produces a valid lease only while the merge proof is live and passing', () => {
    const contract = mergeIntentToUltrathinkContract(intent, proof);
    expect(evaluateAuthorityLease(contract, Date.parse('2026-08-22T23:20:00.000Z')).status).toBe('valid');
    expect(evaluateAuthorityLease(contract, Date.parse('2026-08-22T23:30:00.000Z')).status).toBe('expired');
  });

  it('fails closed when merge proof is not passing', () => {
    const contract = mergeIntentToUltrathinkContract(intent, { ...proof, status: 'not_evaluated' });
    expect(evaluateAuthorityLease(contract, Date.parse('2026-08-22T23:20:00.000Z')).status).toBe('invalid_evidence');
  });
});
