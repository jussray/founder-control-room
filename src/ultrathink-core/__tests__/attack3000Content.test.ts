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

const OBSERVATION_ID = 'li-post-1-window-7d';

const verifiedSupport = (ref: string): Attack3000Evidence => ({
  classification: 'VERIFIED',
  direction: 'SUPPORTS',
  evidenceRefs: [ref],
});

const verifiedMetric = (
  count: number,
  ref: string,
  observationId = OBSERVATION_ID,
): ContentMetricObservation => ({
  observationId,
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
      observation: {
        observationId: OBSERVATION_ID,
        contentFingerprint: '7c4c0474120e8f5a',
        provider: 'linkedin',
        windowStart: '2026-08-31T00:00:00Z',
        windowEnd: '2026-09-07T00:00:00Z',
        observedAt: '2026-09-07T00:05:00Z',
        measurementComplete: true,
        freshness: 'CURRENT',
        classification: 'VERIFIED',
        evidenceRefs: ['analytics-window-receipt'],
      },
      publication: {
        observationId: OBSERVATION_ID,
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

  it('derives distribution-to-outcome rates from one current observation window', () => {
    const terms = deriveContentTerms(baseline().terms);
    expect(terms.classification).toBe('VERIFIED');
    expect(terms.observation.observationId).toBe(OBSERVATION_ID);
    expect(terms.observation.freshness).toBe('CURRENT');
    expect(terms.published).toBe(true);
    expect(terms.engagementRatePct).toBe(10);
    expect(terms.profileViewRatePct).toBe(6);
    expect(terms.visitRatePct).toBe(5);
    expect(terms.qualifiedConversationRatePct).toBe(20);
    expect(terms.dealConversionPct).toBe(25);
  });

  it('returns SUPPORTED when every Attack 3000 dimension and trigger is verified', () => {
    const result = evaluateContentAttack3000(baseline());
    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
  });

  it('holds when a metric belongs to a different outcome observation', () => {
    const input = baseline();
    input.terms.comments = verifiedMetric(20, 'other-comments-ref', 'different-window');
    const result = evaluateContentAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('comments:observation_identity_mismatch');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('preserves stale historical observation identity while refusing a current verdict', () => {
    const input = baseline();
    input.terms.observation.freshness = 'STALE';
    const result = evaluateContentAttack3000(input);
    expect(result.terms.observation.freshness).toBe('STALE');
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('observation:freshness_stale');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('holds when the observation predates completion of its own window', () => {
    const input = baseline();
    input.terms.observation.observedAt = '2026-09-06T23:59:59Z';
    const result = evaluateContentAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('observation:observed_before_window_end');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('does not treat an unpublished artifact as external-demand proof', () => {
    const input = baseline();
    input.terms.publication.published = false;
    input.terms.publication.evidenceRefs = ['draft-receipt'];
    const result = evaluateContentAttack3000(input);
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.assessment.dimensions.external_demand?.direction).toBe('NEUTRAL');
  });

  it('does not treat zero impressions as demand', () => {
    const input = baseline();
    input.terms.impressions = verifiedMetric(0, 'zero-impressions-ref');
    const result = evaluateContentAttack3000(input);
    expect(result.terms.engagementRatePct).toBeNull();
    expect(result.terms.profileViewRatePct).toBeNull();
    expect(result.terms.visitRatePct).toBeNull();
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('does not treat publication and reach alone as external demand', () => {
    const input = baseline();
    input.terms.attributedVisits = verifiedMetric(0, 'zero-visits-ref');
    input.terms.qualifiedConversations = verifiedMetric(0, 'zero-conversations-ref');
    input.terms.attributedContacts = verifiedMetric(0, 'zero-contacts-ref');
    input.terms.attributedDeals = verifiedMetric(0, 'zero-deals-ref');

    const result = evaluateContentAttack3000(input);
    expect(result.assessment.dimensions.external_demand?.direction).toBe('NEUTRAL');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('does not launder generic metric refs into a missing direct demand witness', () => {
    const input = baseline();
    input.evidence.externalDemand = {
      classification: 'VERIFIED',
      direction: 'SUPPORTS',
      evidenceRefs: [],
    };

    const result = evaluateContentAttack3000(input);
    expect(result.assessment.dimensions.external_demand?.classification).toBe('UNKNOWN');
    expect(result.assessment.dimensions.external_demand?.evidenceRefs).toEqual([]);
    expect(result.evaluation.reasons).toContain('dimension:external_demand:unknown');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('downgrades VERIFIED metrics that have no evidence refs', () => {
    const input = baseline();
    input.terms.attributedDeals = {
      observationId: OBSERVATION_ID,
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
      observationId: OBSERVATION_ID,
      count: -1,
      classification: 'VERIFIED',
      evidenceRefs: ['invalid-visits-ref'],
    };
    const result = evaluateContentAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.visitRatePct).toBeNull();
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('does not falsify a metric floor before verified publication', () => {
    const input = baseline();
    input.terms.publication.published = false;
    input.terms.impressions = verifiedMetric(0, 'prepublish-impressions-ref');
    input.stopCondition = {
      kind: 'minimum_impressions',
      floor: { minCount: 1500, classification: 'VERIFIED', evidenceRefs: ['impression-floor-ref'] },
    };
    const result = evaluateContentAttack3000(input);
    expect(result.assessment.stopCondition.triggered).toBe(false);
    expect(result.assessment.stopCondition.classification).toBe('UNKNOWN');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('does not falsify a metric floor before the measurement window is complete', () => {
    const input = baseline();
    input.terms.observation.measurementComplete = false;
    input.terms.impressions = verifiedMetric(0, 'incomplete-impressions-ref');
    input.stopCondition = {
      kind: 'minimum_impressions',
      floor: { minCount: 1500, classification: 'VERIFIED', evidenceRefs: ['impression-floor-ref'] },
    };
    const result = evaluateContentAttack3000(input);
    expect(result.assessment.stopCondition.triggered).toBe(false);
    expect(result.assessment.stopCondition.classification).toBe('UNKNOWN');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('falsifies a verified impression floor even when an unrelated deal metric is unknown', () => {
    const input = baseline();
    input.terms.attributedDeals = {
      observationId: OBSERVATION_ID,
      count: null,
      classification: 'UNKNOWN',
      evidenceRefs: [],
    };
    input.stopCondition = {
      kind: 'minimum_impressions',
      floor: { minCount: 1500, classification: 'VERIFIED', evidenceRefs: ['impression-floor-ref'] },
    };
    const result = evaluateContentAttack3000(input);
    expect(result.assessment.stopCondition.classification).toBe('VERIFIED');
    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
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

  it('holds rather than falsifying an impossible engagement floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'minimum_engagement_rate',
      floor: { minRatePct: 120, classification: 'VERIFIED', evidenceRefs: ['bad-floor-ref'] },
    };
    const result = evaluateContentAttack3000(input);
    expect(result.assessment.stopCondition.classification).toBe('UNKNOWN');
    expect(result.evaluation.verdict).toBe('HOLD');
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
