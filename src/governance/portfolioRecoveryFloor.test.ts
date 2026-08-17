import { describe, expect, it } from 'vitest';
import { evaluatePortfolioGovernedAction } from './portfolioGovernanceProfiles.js';

const NOW = new Date('2026-08-17T03:45:00.000Z');

describe('portfolio recovery floors', () => {
  it('rejects reversible Se’kret work when only an R1 rollback is supplied', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/Sekret-Bip', 'reversible-change', {
      requiredScope: 'reversible-change',
      risk: 'reversible',
      intents: [{
        id: 'current',
        source: 'current_user',
        scope: ['reversible-change'],
        intentHash: 'current-change',
        issuedAt: '2026-08-17T03:40:00.000Z',
        authenticated: true,
      }],
      recoveryPlan: {
        id: 'r1',
        level: 'R1',
        rollbackAction: 'revert change',
      },
      now: NOW,
    });

    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('requires recovery R2 or stronger');
  });

  it('accepts the same bounded change when its project recovery floor is met', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/Sekret-Bip', 'reversible-change', {
      requiredScope: 'reversible-change',
      risk: 'reversible',
      intents: [{
        id: 'current',
        source: 'current_user',
        scope: ['reversible-change'],
        intentHash: 'current-change',
        issuedAt: '2026-08-17T03:40:00.000Z',
        authenticated: true,
      }],
      recoveryPlan: {
        id: 'r2',
        level: 'R2',
        checkpointRef: 'before',
        rollbackAction: 'revert change',
        validationAction: 'verify restored state',
      },
      now: NOW,
    });

    expect(verdict.decision).toBe('allow');
  });
});
