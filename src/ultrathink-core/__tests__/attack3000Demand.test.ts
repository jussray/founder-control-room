import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  type Attack3000Evidence,
  type Attack3000Trigger,
} from '../attack3000.js';
import {
  ATTACK_3000_DEMAND_ADAPTER_ID,
  createDemandAttack3000Assessment,
  deriveDemandTerms,
  evaluateDemandAttack3000,
  type DemandAttack3000Input,
  type DemandCountObservation,
} from '../attack3000Demand.js';

const verifiedSupport = (ref: string): Attack3000Evidence => ({
  classification: 'VERIFIED',
  direction: 'SUPPORTS',
  evidenceRefs: [ref],
});

const verifiedTrigger = (statement: string, triggered = false): Attack3000Trigger => ({
  statement,
  classification: 'VERIFIED',
  triggered,
  evidenceRefs: [`evidence:${statement.replaceAll(' ', '-').toLowerCase()}`],
});

const verifiedCount = (count: number, ref: string): DemandCountObservation => ({
  count,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

function baseline(): DemandAttack3000Input {
  return {
    subject: {
      decisionId: 'product-demand-scale-one',
      projectId: 'project-one',
      portfolioId: 'portfolio-juss',
    },
    terms: {
      exposedUsers: verifiedCount(100, 'evidence:exposed-users'),
      activatedUsers: verifiedCount(40, 'evidence:activated-users'),
      repeatUsers: verifiedCount(20, 'evidence:repeat-users'),
      buyersOffered: verifiedCount(50, 'evidence:buyers-offered'),
      payingBuyers: verifiedCount(5, 'evidence:paying-buyers'),
    },
    evidence: {
      valueCreated: verifiedSupport('evidence:user-value'),
      humanOutcome: verifiedSupport('evidence:user-outcome'),
      externalDemand: verifiedSupport('evidence:demand-ledger'),
      economics: verifiedSupport('evidence:product-economics'),
      opportunityCost: verifiedSupport('evidence:alternative-roadmap'),
      dependencies: verifiedSupport('evidence:demand-dependencies'),
      reversibility: verifiedSupport('evidence:demand-reversibility'),
      secondOrderEffects: verifiedSupport('evidence:retention-effects'),
      thirdOrderEffects: verifiedSupport('evidence:portfolio-demand-effects'),
    },
    falsifier: verifiedTrigger('Demand thesis is disproved'),
    stopCondition: {
      kind: 'explicit',
      trigger: verifiedTrigger('Product demand stop condition is crossed'),
    },
  };
}

describe('Attack 3000 product/customer demand evidence adapter', () => {
  it('derives activation, repeat, and paid conversion from separate cohorts', () => {
    const result = deriveDemandTerms(baseline().terms);

    expect(result.classification).toBe('VERIFIED');
    expect(result.activationRatePct).toBeCloseTo(40, 5);
    expect(result.repeatRatePct).toBeCloseTo(50, 5);
    expect(result.paidConversionPct).toBeCloseTo(10, 5);
    expect(result.reasons).toEqual([]);
  });

  it('keeps user and buyer populations independent', () => {
    const input = baseline();
    input.terms.payingBuyers = verifiedCount(45, 'evidence:paying-buyers-45');

    const result = deriveDemandTerms(input.terms);

    expect(result.classification).toBe('VERIFIED');
    expect(result.paidConversionPct).toBeCloseTo(90, 5);
    expect(result.reasons).not.toContain('buyer_cohort:paying_exceeds_offered');
  });

  it('maps derived demand evidence into the canonical Attack 3000 dimensions', () => {
    const { assessment } = createDemandAttack3000Assessment(baseline());

    expect(assessment.adapterId).toBe(ATTACK_3000_DEMAND_ADAPTER_ID);
    expect(assessment.subject.domain).toBe('product-demand');
    expect(assessment.dimensions.external_demand?.evidenceRefs).toEqual(
      expect.arrayContaining([
        'evidence:demand-ledger',
        'evidence:exposed-users',
        'evidence:activated-users',
        'evidence:repeat-users',
        'evidence:buyers-offered',
        'evidence:paying-buyers',
      ]),
    );
  });

  it('supports fully verified demand evidence but grants zero execution authority', () => {
    const result = evaluateDemandAttack3000(baseline());

    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
    expect(Object.values(result.evaluation.authority).every((value) => value === false)).toBe(true);
  });

  it('holds when a cohort count is inferred even though rates remain computable', () => {
    const input = baseline();
    input.terms.repeatUsers = {
      ...input.terms.repeatUsers,
      classification: 'INFERRED',
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.terms.classification).toBe('INFERRED');
    expect(result.terms.repeatRatePct).toBeCloseTo(50, 5);
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:external_demand:inferred');
  });

  it('holds when VERIFIED cohort evidence omits its evidence reference', () => {
    const input = baseline();
    input.terms.activatedUsers = {
      ...input.terms.activatedUsers,
      evidenceRefs: [],
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('activated_users:verified_without_evidence');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:external_demand:unknown');
  });

  it('fails closed on negative cohort counts', () => {
    const input = baseline();
    input.terms.repeatUsers = verifiedCount(-1, 'evidence:bad-repeat-count');

    const result = evaluateDemandAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.activationRatePct).toBeNull();
    expect(result.terms.repeatRatePct).toBeNull();
    expect(result.terms.paidConversionPct).toBeNull();
    expect(result.terms.reasons).toContain('repeat_users:invalid_count');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed when user cohort counts contradict their funnel', () => {
    const input = baseline();
    input.terms.repeatUsers = verifiedCount(41, 'evidence:repeat-exceeds-activated');

    const result = evaluateDemandAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('user_cohort:repeat_exceeds_activated');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed when paying buyers exceed the independently offered buyer cohort', () => {
    const input = baseline();
    input.terms.payingBuyers = verifiedCount(51, 'evidence:paying-exceeds-offered');

    const result = evaluateDemandAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('buyer_cohort:paying_exceeds_offered');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('falsifies when verified activation falls below the founder floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'activation_rate_floor',
      floor: {
        minRatePct: 45,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:activation-floor'],
      },
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
  });

  it('keeps verified repeat demand above the founder floor eligible for support', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'repeat_rate_floor',
      floor: {
        minRatePct: 40,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:repeat-floor'],
      },
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(false);
    expect(result.evaluation.verdict).toBe('SUPPORTED');
  });

  it('falsifies when verified paid conversion falls below the founder floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'paid_conversion_floor',
      floor: {
        minRatePct: 15,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:paid-conversion-floor'],
      },
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
  });

  it('does not promote an inferred founder floor into a verified stop decision', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'activation_rate_floor',
      floor: {
        minRatePct: 45,
        classification: 'INFERRED',
        evidenceRefs: ['memory:activation-floor-not-reconfirmed'],
      },
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.assessment.stopCondition.classification).toBe('INFERRED');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('stop_condition:inferred');
    expect(result.evaluation.reasons).not.toContain('stop_condition:triggered');
  });

  it('preserves an explicit verified stop condition without creating external authority', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'explicit',
      trigger: verifiedTrigger('Demand experiment stop is crossed', true),
    };

    const result = evaluateDemandAttack3000(input);

    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.authority.authorizesExternalContact).toBe(false);
    expect(result.evaluation.authority.authorizesSpend).toBe(false);
  });
});
