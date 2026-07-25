import { describe, expect, it } from 'vitest';
import { scoreCapabilityContract } from './score.js';

describe('scoreCapabilityContract', () => {
  it('scores proof states deterministically and excludes not applicable claims', () => {
    const result = scoreCapabilityContract({
      capabilities: [
        { id: 'BUILD', status: 'verified', evidence_ids: ['build-1'] },
        { id: 'TEST', status: 'partial' },
        { id: 'DEPLOY', status: 'unverified' },
        { id: 'ROLLBACK', status: 'blocked' },
        { id: 'CRM', status: 'not_applicable' },
      ],
    });

    expect(result).toEqual({
      score: 43,
      applicable: 4,
      verified: 1,
      partial: 1,
      unverified: 1,
      blocked: 1,
      notApplicable: 1,
    });
  });

  it('returns zero when every capability is not applicable', () => {
    expect(
      scoreCapabilityContract({ capabilities: [{ id: 'CRM', status: 'not_applicable' }] }),
    ).toMatchObject({ score: 0, applicable: 0, notApplicable: 1 });
  });
});
