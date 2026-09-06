import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  type Attack3000Evidence,
  type Attack3000Trigger,
} from '../attack3000.js';
import {
  ATTACK_3000_COMMERCE_ADAPTER_ID,
  createCommerceAttack3000Assessment,
  deriveCommerceTerms,
  evaluateCommerceAttack3000,
  type CommerceAttack3000Input,
  type CommerceMoneyObservation,
} from '../attack3000Commerce.js';

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

const verifiedMoney = (amountCents: number, ref: string): CommerceMoneyObservation => ({
  amountCents,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

function baseline(): CommerceAttack3000Input {
  return {
    subject: {
      decisionId: 'commerce-scale-product-one',
      projectId: 'jbh',
      portfolioId: 'portfolio-juss',
    },
    terms: {
      unitRevenue: verifiedMoney(10_000, 'evidence:unit-revenue'),
      unitCogs: verifiedMoney(4_000, 'evidence:unit-cogs'),
      variableFulfillmentCost: verifiedMoney(1_000, 'evidence:fulfillment'),
      variableAcquisitionCost: verifiedMoney(2_000, 'evidence:acquisition'),
      cashLockedPerUnit: verifiedMoney(4_000, 'evidence:cash-lockup'),
    },
    evidence: {
      valueCreated: verifiedSupport('evidence:customer-value'),
      humanOutcome: verifiedSupport('evidence:customer-outcome'),
      externalDemand: verifiedSupport('evidence:paid-demand'),
      economics: verifiedSupport('evidence:commerce-ledger'),
      opportunityCost: verifiedSupport('evidence:capital-alternatives'),
      dependencies: verifiedSupport('evidence:supplier-fulfillment'),
      reversibility: verifiedSupport('evidence:inventory-exit-path'),
      secondOrderEffects: verifiedSupport('evidence:repeat-purchase-effects'),
      thirdOrderEffects: verifiedSupport('evidence:portfolio-capital-effects'),
    },
    falsifier: verifiedTrigger('Paid demand thesis is disproved'),
    stopCondition: {
      kind: 'explicit',
      trigger: verifiedTrigger('Commerce stop condition is crossed'),
    },
  };
}

describe('Attack 3000 commerce evidence adapter', () => {
  it('derives gross and contribution margin from unit economics', () => {
    const result = deriveCommerceTerms(baseline().terms);

    expect(result.classification).toBe('VERIFIED');
    expect(result.grossProfitCents).toBe(6_000);
    expect(result.grossMarginPct).toBeCloseTo(60, 5);
    expect(result.contributionProfitCents).toBe(3_000);
    expect(result.contributionMarginPct).toBeCloseTo(30, 5);
    expect(result.cashLockedPerUnitCents).toBe(4_000);
    expect(result.reasons).toEqual([]);
  });

  it('maps commerce evidence into the canonical Attack 3000 dimensions', () => {
    const { assessment } = createCommerceAttack3000Assessment(baseline());

    expect(assessment.adapterId).toBe(ATTACK_3000_COMMERCE_ADAPTER_ID);
    expect(assessment.subject.domain).toBe('commerce');
    expect(assessment.dimensions.external_demand?.evidenceRefs).toContain('evidence:paid-demand');
    expect(assessment.dimensions.economics?.evidenceRefs).toEqual(
      expect.arrayContaining([
        'evidence:commerce-ledger',
        'evidence:unit-revenue',
        'evidence:unit-cogs',
        'evidence:fulfillment',
        'evidence:acquisition',
        'evidence:cash-lockup',
      ]),
    );
  });

  it('supports fully verified commerce evidence but grants zero execution authority', () => {
    const result = evaluateCommerceAttack3000(baseline());

    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
    expect(Object.values(result.evaluation.authority).every((value) => value === false)).toBe(true);
  });

  it('holds when acquisition cost is inferred even though margin arithmetic is computable', () => {
    const input = baseline();
    input.terms.variableAcquisitionCost = {
      ...input.terms.variableAcquisitionCost,
      classification: 'INFERRED',
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.terms.classification).toBe('INFERRED');
    expect(result.terms.contributionMarginPct).toBeCloseTo(30, 5);
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:economics:inferred');
  });

  it('holds when VERIFIED unit economics omit their evidence reference', () => {
    const input = baseline();
    input.terms.unitCogs = {
      ...input.terms.unitCogs,
      evidenceRefs: [],
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('unit_cogs:verified_without_evidence');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:economics:unknown');
  });

  it('fails closed on impossible negative cost observations', () => {
    const input = baseline();
    input.terms.unitCogs = verifiedMoney(-1, 'evidence:bad-cogs');

    const result = evaluateCommerceAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.grossMarginPct).toBeNull();
    expect(result.terms.contributionMarginPct).toBeNull();
    expect(result.terms.reasons).toContain('unit_cogs:invalid_amount');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('falsifies when verified contribution margin falls below the founder floor', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'contribution_margin_floor',
      floor: {
        minContributionMarginPct: 35,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:founder-margin-floor'],
      },
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
  });

  it('keeps verified economics above the founder contribution floor eligible for support', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'contribution_margin_floor',
      floor: {
        minContributionMarginPct: 25,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:founder-margin-floor'],
      },
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(false);
    expect(result.evaluation.verdict).toBe('SUPPORTED');
  });

  it('does not promote an inferred margin floor into a verified stop decision', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'contribution_margin_floor',
      floor: {
        minContributionMarginPct: 35,
        classification: 'INFERRED',
        evidenceRefs: ['memory:margin-floor-not-reconfirmed'],
      },
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.assessment.stopCondition.classification).toBe('INFERRED');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('stop_condition:inferred');
    expect(result.evaluation.reasons).not.toContain('stop_condition:triggered');
  });

  it('falsifies when verified cash lockup exceeds the founder ceiling', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'cash_lockup_ceiling',
      ceiling: {
        maxCashLockedPerUnitCents: 3_000,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:founder-cash-ceiling'],
      },
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
  });

  it('preserves an explicit verified stop condition without creating spend authority', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'explicit',
      trigger: verifiedTrigger('Inventory risk stop is crossed', true),
    };

    const result = evaluateCommerceAttack3000(input);

    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.authority.authorizesSpend).toBe(false);
  });
});
