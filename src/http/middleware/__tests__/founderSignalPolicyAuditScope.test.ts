import { describe, expect, it } from 'vitest';
import { selectPortfolioPolicyAuditProjectId } from '../founderSignalEngineWriteGate.js';

describe('Founder Signal portfolio policy-audit resolver', () => {
  const portfolio = {
    project_id: 'portfolio-project',
    config: {
      repositoryScope: { mode: 'all_owned', owner: 'jussray' },
    },
  };

  it('selects one matching all-owned portfolio project for an exact owner/repository identity', () => {
    expect(
      selectPortfolioPolicyAuditProjectId([portfolio], 'jussray/brand-new-repository'),
    ).toBe('portfolio-project');
  });

  it('fails closed for outside-owner and malformed repository identities', () => {
    expect(
      selectPortfolioPolicyAuditProjectId([portfolio], 'someone-else/private-repo'),
    ).toBeNull();
    expect(
      selectPortfolioPolicyAuditProjectId([portfolio], 'jussray/repo/extra'),
    ).toBeNull();
    expect(
      selectPortfolioPolicyAuditProjectId([portfolio], 'jussray/'),
    ).toBeNull();
  });

  it('ignores unrelated, inactive-shaped, and malformed scope payloads supplied to the selector', () => {
    expect(
      selectPortfolioPolicyAuditProjectId(
        [
          { project_id: 'other', config: { repositoryScope: { mode: 'all_owned', owner: 'other' } } },
          { project_id: 'bad-mode', config: { repositoryScope: { mode: 'explicit', owner: 'jussray' } } },
          { project_id: '', config: portfolio.config },
          null,
          portfolio,
        ],
        'jussray/future-repo',
      ),
    ).toBe('portfolio-project');
  });

  it('rejects ambiguous matching portfolio projects instead of guessing an audit destination', () => {
    expect(() =>
      selectPortfolioPolicyAuditProjectId(
        [
          portfolio,
          {
            project_id: 'second-portfolio-project',
            config: {
              repositoryScope: { mode: 'all_owned', owner: 'jussray' },
            },
          },
        ],
        'jussray/future-repo',
      ),
    ).toThrow('POLICY_PORTFOLIO_SCOPE_AMBIGUOUS:jussray/future-repo');
  });

  it('deduplicates repeated connections that resolve to the same portfolio project', () => {
    expect(
      selectPortfolioPolicyAuditProjectId(
        [portfolio, { ...portfolio }],
        'jussray/future-repo',
      ),
    ).toBe('portfolio-project');
  });
});
