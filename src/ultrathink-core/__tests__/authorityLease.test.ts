import { describe, expect, it } from 'vitest';
import {
  evaluateAuthorityLease,
  type AuthorityLease,
  type AuthorityWorldState,
} from '../authorityLease.js';

const lease: AuthorityLease = {
  id: 'lease-1',
  subject: 'merge-pr-123',
  consequence: 'merge',
  evidenceIds: ['proof-1'],
  issuedAt: '2026-08-22T12:00:00.000Z',
  expiresAt: '2026-08-22T14:00:00.000Z',
  binding: {
    repository: 'jussray/example',
    baseSha: 'base-a',
    headSha: 'head-a',
    diffHash: 'diff-a',
    policyHash: 'policy-a',
    actor: 'jussray',
  },
};

const world: AuthorityWorldState = {
  repository: 'jussray/example',
  baseSha: 'base-a',
  headSha: 'head-a',
  diffHash: 'diff-a',
  policyHash: 'policy-a',
  actor: 'jussray',
  now: '2026-08-22T13:00:00.000Z',
};

describe('evaluateAuthorityLease', () => {
  it('keeps authority valid when evidence and every bound identity still match', () => {
    expect(evaluateAuthorityLease(lease, world)).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it('expires authority when its proof lease is no longer fresh', () => {
    expect(
      evaluateAuthorityLease(lease, {
        ...world,
        now: '2026-08-22T14:00:00.000Z',
      }),
    ).toEqual({ valid: false, reasons: ['expired'] });
  });

  it('invalidates authority when the candidate head drifts', () => {
    expect(
      evaluateAuthorityLease(lease, { ...world, headSha: 'head-b' }),
    ).toEqual({ valid: false, reasons: ['head_drift'] });
  });

  it('reports every changed bound identity instead of hiding compound drift', () => {
    expect(
      evaluateAuthorityLease(lease, {
        ...world,
        baseSha: 'base-b',
        diffHash: 'diff-b',
        policyHash: 'policy-b',
      }),
    ).toEqual({
      valid: false,
      reasons: ['base_drift', 'diff_drift', 'policy_drift'],
    });
  });

  it('fails closed when authority has no evidence', () => {
    expect(
      evaluateAuthorityLease({ ...lease, evidenceIds: [] }, world),
    ).toEqual({ valid: false, reasons: ['missing_evidence'] });
  });

  it('keeps revocation sticky even if all world-state bindings match', () => {
    expect(
      evaluateAuthorityLease(
        { ...lease, revokedAt: '2026-08-22T12:30:00.000Z' },
        world,
      ),
    ).toEqual({ valid: false, reasons: ['revoked'] });
  });
});
