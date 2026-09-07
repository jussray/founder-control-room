import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  type Attack3000Evidence,
  type Attack3000Trigger,
} from '../attack3000.js';
import {
  ATTACK_3000_CONTENT_ADAPTER_ID,
  createContentAttack3000Assessment,
  deriveContentTerms,
  evaluateContentAttack3000,
  type ContentAttack3000Input,
  type ContentMetricObservation,
} from '../attack3000Content.js';

const verifiedSupport = (ref: string): Attack3000Evidence => ({
  classification: 'VERIFIED',
  direction: 'SUPPORTS',
  evidenceRefs: [ref],
});

const verifiedMetric = (count: number, ref: string): ContentMetricObservation => ({
  count,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

const clearTrigger = (name: string): Attack3000Trigger => ({
  statement: `${name} is not triggered.`,
  classification: 'VERIFIED',
  triggered: false,
  evidenceRefs: [`${name}-ref`],
});

function baseline(): ContentAttack3000Input {
  return {
    subject: { decisionId: 'content-wave-1', projectId: 'fcr' },
    terms: {
      publication: {
        published: true,
        classification: 'VERIFIED',
        evidenceRefs: ['publish-receipt'],
      },
      impressions: verifiedMetric(1000, 'impressions-ref'),
      reactions: verifiedMetric(80, 'reactions-ref'),
      comments: verifiedMetric(20, 'comments-ref'),
      profileViews: verifiedMetric(60, 'profile-views-ref'),
      attributedVisits: verifiedMetric(50, 'visits-ref'),
      qualifiedConversations: verifiedMetric(10, 'conversations-ref'),
      attributedContacts: verifiedMetric(8, 'contacts-ref'),
      attributedDeals: verifiedMetric(2, 'deals-ref'),
    },
    evidence: {
      valueCreated: verifiedSupport('value-ref'),
      humanOutcome: verifiedSupport('human-ref'),
      externalDemand: verifiedSupport('demand-ref'),
      economics: verifiedSupport('economics-ref'),
      opportunityCost: verifiedSupport('opportunity-ref'),
      dependencies: verifiedSupport('dependencies-ref'),
      reversibility: verifiedSupport('reversibility-ref'),
      secondOrderEffects: verifiedSupport('second-order-ref'),
      thirdOrderEffects: verifiedSupport('third-order-ref'),
    },
    falsifier: clearTrigger('falsifier'),
    stopCondition: { kind: 'explicit', trigger: clearTrigger('stop') },
  };
}

describe('Attack 3000 content adapter', () => {
  it('uses the canonical content adapter id and content domain', () => {
    const { assessment } = createContentAttack3000Assessment(baseline());
    expect(assessment.adapterId).toBe(ATTACK_3000_CONTENT_ADAPTER_ID);
    expect(assessment.subject.domain).toBe('content');
  });

  it('derives distribution-to-outcome rates from observed counters', () => {
    const terms = deriveContentTerms(baseline().terms);
    expect(terms.classification).toBe('VERIFIED');
    expect(terms.published).toBe(true);
    expect(terms.engagementRatePct).toBe(10);
    expect(terms.visitRatePct).toBe(5);
    expect(terms.qualifiedConversationRatePct).toBe(20);
    expect(terms.dealConversionPct).toBe(25);
  });

  it('returns SUPPORTED when every Attack 3000 dimension and trigger is verified', () => {
    const result = evaluateContentAttack3000(baseline());
    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
  });

  it('does not treat an unpublished artifact as external-demand proof', () => {
    const input = baseline();
    input.terms.publication = {
      published: false,
      classification: 'VERIFIED',
      evidenceRefs: ['draft-receipt'],
    };
    const result = evaluateContentAttack3000(input);
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.assessment.dimensions.external_demand?.direction).toBe('NEUTRAL');
  });

  it('does not treat zero impressions as demand', () => {
    const input = baseline();
    input.terms.impressions = verifiedMetric(0, 'zero-impressions-ref');
    const result = evaluateContentAttack3000(input);
    expect(result.terms.engagementRatePct).toBeNull();
    expect(result.terms.visitRatePct).toBeNull();
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('downgrades VERIFIED metrics that have no evidence refs', () => {
    const input = baseline();
    input.terms.attributedDeals = {
      count: 2,
      classification: 'VERIFIED',
      evidenceRefs: [],
    };
    const result = evaluateContentAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('downgrades invalid metric counts instead of manufacturing a rate', () => {
    const input = baseline();
    input.terms.attributedVisits = {
      count: -1,
      classification: 'VERIFIED',
      evidenceRefs: ['invalid-visits-ref'],
    };
    const result = evaluateContentAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.visitRatePct).toBeNull();
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('falsifies when impressions miss a verified founder-defined floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'minimum_impressions',
      floor: { minCount: 1500, classification: 'VERIFIED', evidenceRefs: ['impression-floor-ref'] },
    };
    const result = evaluateContentAttack3000(input);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
  });

  it('falsifies when engagement misses a verified founder-defined floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'minimum_engagement_rate',
      floor: { minRatePct: 12, classification: 'VERIFIED', evidenceRefs: ['engagement-floor-ref'] },
    };
    expect(evaluateContentAttack3000(input).evaluation.verdict).toBe('FALSIFIED');
  });

  it('falsifies when qualified conversations miss a verified floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'minimum_qualified_conversations',
      floor: { minCount: 12, classification: 'VERIFIED', evidenceRefs: ['conversation-floor-ref'] },
    };
    expect(evaluateContentAttack3000(input).evaluation.verdict).toBe('FALSIFIED');
  });

  it('falsifies when attributed deals miss a verified floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'minimum_attributed_deals',
      floor: { minCount: 3, classification: 'VERIFIED', evidenceRefs: ['deal-floor-ref'] },
    };
    expect(evaluateContentAttack3000(input).evaluation.verdict).toBe('FALSIFIED');
  });

  it('holds rather than falsifying when a floor is not verified', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'minimum_attributed_deals',
      floor: { minCount: 3, classification: 'INFERRED', evidenceRefs: ['inferred-floor-ref'] },
    };
    const result = evaluateContentAttack3000(input);
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('stop_condition:inferred');
  });

  it('keeps content evaluation non-authorizing even when supported', () => {
    const result = evaluateContentAttack3000(baseline());
    expect(result.evaluation.authority.authorizesPublish).toBe(false);
    expect(result.evaluation.authority.authorizesExternalContact).toBe(false);
    expect(result.evaluation.authority.authorizesSpend).toBe(false);
    expect(result.evaluation.authority.authorizesMerge).toBe(false);
    expect(result.evaluation.authority.authorizesDeploy).toBe(false);
  });
});
