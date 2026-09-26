import { describe, expect, it } from 'vitest';
import {
  evaluateGrowthOpportunity,
  type GrowthOpportunityInput,
  type OpportunityEvidence,
} from '../opportunityIntelligence.js';
import type { LeadRecord } from '../../types/growthInbox.js';

const EVALUATED_AT = '2026-09-26T18:30:00.000Z';

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    projectId: 'founder-control-room',
    contactId: 'contact-001',
    stage: 'new',
    expressedNeed: 'Needs an evidence-bound product audit.',
    productOrOffer: 'Business Leak QuickScan',
    sourceCampaign: 'linkedin-proof-series',
    qualificationEvidence: [],
    revenueState: 'conversation',
    lastStageChangeAt: '2026-09-26T17:00:00.000Z',
    ...overrides,
  };
}

function evidence(
  signal: OpportunityEvidence['signal'],
  reference: string,
  overrides: Partial<OpportunityEvidence> = {},
): OpportunityEvidence {
  return {
    reference,
    signal,
    state: 'verified',
    source: 'first-party-inbound',
    observedAt: '2026-09-26T18:00:00.000Z',
    ...overrides,
  };
}

function input(overrides: Partial<GrowthOpportunityInput> = {}): GrowthOpportunityInput {
  return {
    lead: lead(),
    projectNorthStar: 'Create attributable qualified founder opportunities that can advance to verified revenue.',
    evaluatedAt: EVALUATED_AT,
    evidence: [
      evidence('expressed_need', 'inbox://conversation/001#need'),
      evidence('fit_question', 'inbox://conversation/001#fit'),
      evidence('reply', 'gmail://thread/001#reply'),
    ],
    offerId: 'business-leak-quickscan',
    ...overrides,
  };
}

describe('growth opportunity intelligence', () => {
  it('scores only verified explicit signals and recommends a stage without granting execution authority', () => {
    const result = evaluateGrowthOpportunity(input());

    expect(result).toMatchObject({
      contract: 'fcr/growth-opportunity-intelligence@v1',
      projectId: 'founder-control-room',
      score: 40,
      priorityBand: 'warm',
      recommendedStage: 'qualified',
      nextGate: 'prepare_evidence_bound_founder_draft',
      authority: {
        advisoryOnly: true,
        authorizesOutreach: false,
        authorizesPricing: false,
        authorizesLeadMutation: false,
        authorizesProviderMutation: false,
        authorizesSpend: false,
      },
    });
    expect(result.personalizationContext).toMatchObject({
      expressedNeed: 'Needs an evidence-bound product audit.',
      productOrOffer: 'Business Leak QuickScan',
      sourceCampaign: 'linkedin-proof-series',
      verifiedSignals: ['expressed_need', 'fit_question', 'reply'],
    });
    expect(result.continuity.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.continuity.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps unknown, conflicting, and expired evidence visible without letting it increase priority', () => {
    const result = evaluateGrowthOpportunity(input({
      evidence: [
        evidence('reply', 'gmail://thread/002#reply'),
        evidence('purchase_action', 'store://checkout/002', { state: 'unknown' }),
        evidence('price_interest', 'inbox://conversation/002#price', { state: 'conflicting' }),
        evidence('timing_interest', 'inbox://conversation/002#timing', { state: 'expired' }),
      ],
    }));

    expect(result.score).toBe(5);
    expect(result.priorityBand).toBe('cool');
    expect(result.recommendedStage).toBe('engaged');
    expect(result.unknowns).toEqual([
      'conflicting:price_interest:inbox://conversation/002#price',
      'expired:timing_interest:inbox://conversation/002#timing',
      'unknown:purchase_action:store://checkout/002',
    ]);
  });

  it('never regresses active funnel progress when later verified evidence is weaker', () => {
    const qualified = evaluateGrowthOpportunity(input({
      lead: lead({ stage: 'qualified' }),
      evidence: [evidence('reply', 'gmail://thread/qualified#reply')],
    }));
    expect(qualified.recommendedStage).toBe('qualified');
    expect(qualified.nextGate).toBe('prepare_evidence_bound_founder_draft');

    const nurture = evaluateGrowthOpportunity(input({
      lead: lead({ stage: 'nurture' }),
      evidence: [],
    }));
    expect(nurture.recommendedStage).toBe('nurture');

    const booked = evaluateGrowthOpportunity(input({
      lead: lead({ stage: 'booked' }),
      evidence: [evidence('price_interest', 'inbox://conversation/booked#price')],
    }));
    expect(booked.recommendedStage).toBe('booked');
    expect(booked.nextGate).toBe('verify_booking_then_prepare_delivery');
  });

  it('recognizes won only when collected-payment evidence is complete, not from a label alone', () => {
    const incomplete = evaluateGrowthOpportunity(input({
      lead: lead({ revenueState: 'payment_collected', actualCollectedValueCents: undefined }),
      evidence: [],
    }));
    expect(incomplete.priorityBand).toBe('unknown');
    expect(incomplete.recommendedStage).toBe('new');

    const stageLabelOnly = evaluateGrowthOpportunity(input({
      lead: lead({ stage: 'won', revenueState: 'conversation', actualCollectedValueCents: undefined }),
      evidence: [],
    }));
    expect(stageLabelOnly.priorityBand).toBe('unknown');
    expect(stageLabelOnly.recommendedStage).toBe('new');

    const collected = evaluateGrowthOpportunity(input({
      lead: lead({ revenueState: 'payment_collected', actualCollectedValueCents: 24900 }),
      evidence: [],
    }));
    expect(collected.priorityBand).toBe('won');
    expect(collected.recommendedStage).toBe('won');
    expect(collected.nextGate).toBe('deliver_and_verify_customer_value');
  });

  it('makes do-not-contact a hard prioritization ceiling even when buying signals are strong', () => {
    const result = evaluateGrowthOpportunity(input({
      lead: lead({ stage: 'do_not_contact' }),
      evidence: [
        evidence('purchase_action', 'store://checkout/003'),
        evidence('booking_action', 'calendar://booking/003'),
        evidence('expressed_need', 'inbox://conversation/003#need'),
      ],
    }));

    expect(result.score).toBe(70);
    expect(result.priorityBand).toBe('blocked');
    expect(result.recommendedStage).toBe('do_not_contact');
    expect(result.nextGate).toBe('respect_suppression');
    expect(result.authority.authorizesOutreach).toBe(false);
  });

  it('produces the same evidence fingerprint regardless of evidence input order', () => {
    const first = evidence('expressed_need', 'inbox://conversation/004#need');
    const second = evidence('price_interest', 'inbox://conversation/004#price');

    const left = evaluateGrowthOpportunity(input({ evidence: [first, second] }));
    const right = evaluateGrowthOpportunity(input({ evidence: [second, first] }));

    expect(left.continuity.evidenceDigest).toBe(right.continuity.evidenceDigest);
    expect(left.continuity.fingerprint).toBe(right.continuity.fingerprint);
  });

  it('routes only verified North Star outcomes toward PromptOS promotion or revision memory', () => {
    const success = evaluateGrowthOpportunity(input({
      learningOutcome: {
        state: 'verified_success',
        northStarMet: true,
        evidenceReferences: ['analytics://qualified-replies/6'],
      },
    }));
    expect(success.learning.disposition).toBe('promote_candidate');

    const miss = evaluateGrowthOpportunity(input({
      learningOutcome: {
        state: 'verified_miss',
        northStarMet: false,
        evidenceReferences: ['analytics://qualified-replies/0'],
      },
    }));
    expect(miss.learning.disposition).toBe('revision_memory');

    const contradictory = evaluateGrowthOpportunity(input({
      learningOutcome: {
        state: 'verified_success',
        northStarMet: false,
        evidenceReferences: ['analytics://qualified-replies/conflict'],
      },
    }));
    expect(contradictory.learning.disposition).toBe('hold_unknown');
  });

  it('fails closed on duplicate, future-dated, unsupported, or untraceable evidence', () => {
    expect(() => evaluateGrowthOpportunity(input({
      evidence: [
        evidence('reply', 'gmail://thread/005#reply'),
        evidence('expressed_need', 'gmail://thread/005#reply'),
      ],
    }))).toThrow('duplicate evidence reference');

    expect(() => evaluateGrowthOpportunity(input({
      evidence: [evidence('reply', 'gmail://thread/006#reply', {
        observedAt: '2026-09-26T19:00:00.000Z',
      })],
    }))).toThrow('cannot be future-dated');

    expect(() => evaluateGrowthOpportunity(input({
      evidence: [{
        ...evidence('reply', 'gmail://thread/007#reply'),
        signal: 'sensitive_vulnerability' as OpportunityEvidence['signal'],
      }],
    }))).toThrow('signal is unsupported');

    expect(() => evaluateGrowthOpportunity(input({
      evidence: [evidence('reply', '??')],
    }))).toThrow('reference is missing or malformed');
  });
});
