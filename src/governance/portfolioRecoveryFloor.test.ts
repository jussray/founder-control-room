import { describe, expect, it } from 'vitest';
import { portfolioHardConstraintViolations } from './portfolioGovernanceProfiles.js';

describe('portfolio recovery floors', () => {
  it('rejects effectful JBH work when only R1 is supplied against the R2 project floor', () => {
    const violations = portfolioHardConstraintViolations(
      'jussray/jussbeautifulhair-site',
      'production_claim',
      'R1',
      'reversible',
    );

    expect(violations).toContain('project requires recovery R2 or stronger; received R1');
  });

  it('clears the recovery-floor violation when R2 is supplied for the same registered action', () => {
    const violations = portfolioHardConstraintViolations(
      'jussray/jussbeautifulhair-site',
      'production_claim',
      'R2',
      'reversible',
    );

    expect(violations).toEqual([]);
  });
});
