import { describe, expect, it } from 'vitest';
import {
  evaluateOpportunityExecutionGate,
  type OpportunityExecutionTerms,
} from '../opportunityExecutionGate.js';

const NOW = '2026-10-06T16:00:00.000Z';

function verified(overrides: Partial<OpportunityExecutionTerms> = {}): OpportunityExecutionTerms {
  return {
    source: 'provider://opportunity/001',
    observedAt: '2026-10-06T15:30:00.000Z',
    evidenceReferences: ['provider://opportunity/001#terms'],
    eligibility: 'verified_eligible',
    aiAuthority: 'autonomous_explicitly_allowed',
    identityRequirement: 'none',
    payment: {
      state: 'verified_compensated',
      expectedGrossCents: 10000,
      expectedExternalCostCents: 500,
    },
    ...overrides,
  };
}

describe('opportunity execution gate', () => {
  it('fails closed without verified terms', () => {
    const result = evaluateOpportunityExecutionGate(undefined, NOW);
    expect(result.classification).toBe('unknown');
    expect(result.routingDecision).toBe('stop_unknown');
    expect(result.authority.authorizesAutonomousExecution).toBe(false);
    expect(result.authority.authorizesSubmission).toBe(false);
  });

  it('produces an execute candidate only for verified eligible profitable autonomous terms', () => {
    const result = evaluateOpportunityExecutionGate(verified(), NOW);
    expect(result.classification).toBe('autonomous_allowed');
    expect(result.routingDecision).toBe('execute_candidate');
    expect(result.economics.expectedContributionCents).toBe(9500);
    expect(result.economics.profitability).toBe('positive');
    expect(result.authority.requiresOpportunitySpecificExecutionGrant).toBe(true);
  });

  it('routes assisted and identity-bound work to founder action', () => {
    const assisted = evaluateOpportunityExecutionGate(verified({
      aiAuthority: 'assistance_explicitly_allowed',
    }), NOW);
    expect(assisted.classification).toBe('ai_assisted_allowed');
    expect(assisted.routingDecision).toBe('human_action_required');

    const identityBound = evaluateOpportunityExecutionGate(verified({
      identityRequirement: 'named_human_required',
    }), NOW);
    expect(identityBound.classification).toBe('ai_assisted_allowed');
    expect(identityBound.routingDecision).toBe('human_action_required');
  });

  it('stops prohibited, ineligible, unpaid, and non-positive lanes', () => {
    const prohibited = evaluateOpportunityExecutionGate(verified({
      aiAuthority: 'explicitly_prohibited',
    }), NOW);
    expect(prohibited.classification).toBe('human_only');
    expect(prohibited.routingDecision).toBe('human_action_required');

    const ineligible = evaluateOpportunityExecutionGate(verified({
      eligibility: 'verified_ineligible',
    }), NOW);
    expect(ineligible.routingDecision).toBe('stop_ineligible');

    const unpaid = evaluateOpportunityExecutionGate(verified({
      payment: {
        state: 'verified_unpaid',
        expectedGrossCents: 0,
        expectedExternalCostCents: 100,
      },
    }), NOW);
    expect(unpaid.routingDecision).toBe('stop_economics');

    const breakEven = evaluateOpportunityExecutionGate(verified({
      payment: {
        state: 'verified_compensated',
        expectedGrossCents: 500,
        expectedExternalCostCents: 500,
      },
    }), NOW);
    expect(breakEven.routingDecision).toBe('stop_economics');
  });

  it('requires compensation and cost evidence before profitability is known', () => {
    const result = evaluateOpportunityExecutionGate(verified({
      payment: {
        state: 'verified_compensated',
        expectedGrossCents: 10000,
      },
    }), NOW);
    expect(result.routingDecision).toBe('stop_unknown');
    expect(result.economics.profitability).toBe('unknown');
  });

  it('rejects untraceable, future-dated, or contradictory verified terms', () => {
    expect(() => evaluateOpportunityExecutionGate(verified({
      evidenceReferences: [],
    }), NOW)).toThrow('verified execution terms require at least one evidence reference');

    expect(() => evaluateOpportunityExecutionGate(verified({
      observedAt: '2026-10-06T16:30:00.000Z',
    }), NOW)).toThrow('cannot be future-dated');

    expect(() => evaluateOpportunityExecutionGate(verified({
      payment: {
        state: 'verified_unpaid',
        expectedGrossCents: 1,
        expectedExternalCostCents: 0,
      },
    }), NOW)).toThrow('verified unpaid terms cannot declare positive expectedGrossCents');
  });
});
