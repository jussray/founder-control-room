import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  type Attack3000Evidence,
  type Attack3000Trigger,
} from '../attack3000.js';
import {
  ATTACK_3000_VENDOR_ADAPTER_ID,
  createVendorAttack3000Assessment,
  deriveVendorPartnershipTerms,
  evaluateVendorAttack3000,
  type VendorAttack3000Input,
  type VendorBooleanObservation,
  type VendorCountObservation,
  type VendorNumberObservation,
} from '../attack3000Vendor.js';

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

const verifiedNumber = (value: number, ref: string): VendorNumberObservation => ({
  value,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

const verifiedCount = (count: number, ref: string): VendorCountObservation => ({
  count,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

const verifiedBoolean = (value: boolean, ref: string): VendorBooleanObservation => ({
  value,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

function baseline(): VendorAttack3000Input {
  return {
    subject: {
      decisionId: 'vendor-partnership-one',
      projectId: 'project-one',
      portfolioId: 'portfolio-juss',
    },
    terms: {
      agreedCostUsd: verifiedNumber(1000, 'evidence:agreed-cost'),
      actualCostUsd: verifiedNumber(950, 'evidence:actual-cost'),
      milestonesDue: verifiedCount(4, 'evidence:milestones-due'),
      milestonesAccepted: verifiedCount(4, 'evidence:milestones-accepted'),
      monthlyOperationalHours: verifiedNumber(2, 'evidence:operational-hours'),
      exitLeadTimeDays: verifiedNumber(7, 'evidence:exit-days'),
      artifactsPortable: verifiedBoolean(true, 'evidence:portable-artifacts'),
      dataExportable: verifiedBoolean(true, 'evidence:data-export'),
      replacementPath: verifiedBoolean(true, 'evidence:replacement-path'),
      realizedOutcome: verifiedBoolean(true, 'evidence:realized-outcome'),
    },
    evidence: {
      valueCreated: verifiedSupport('evidence:value-created'),
      humanOutcome: verifiedSupport('evidence:human-outcome'),
      externalDemand: verifiedSupport('evidence:external-demand'),
      economics: verifiedSupport('evidence:economics'),
      opportunityCost: verifiedSupport('evidence:opportunity-cost'),
      dependencies: verifiedSupport('evidence:dependencies'),
      reversibility: verifiedSupport('evidence:reversibility'),
      secondOrderEffects: verifiedSupport('evidence:second-order'),
      thirdOrderEffects: verifiedSupport('evidence:third-order'),
    },
    falsifier: verifiedTrigger('Vendor thesis is disproved'),
    stopCondition: {
      kind: 'explicit',
      trigger: verifiedTrigger('Vendor stop condition is crossed'),
    },
  };
}

describe('Attack 3000 vendor/partnership evidence adapter', () => {
  it('derives delivery, cost, operational burden, exit readiness, and realized outcome', () => {
    const result = deriveVendorPartnershipTerms(baseline().terms);

    expect(result.deliveryClassification).toBe('VERIFIED');
    expect(result.economicsClassification).toBe('VERIFIED');
    expect(result.exitClassification).toBe('VERIFIED');
    expect(result.milestoneAcceptanceRatePct).toBeCloseTo(100, 5);
    expect(result.costVariancePct).toBeCloseTo(-5, 5);
    expect(result.monthlyOperationalHours).toBe(2);
    expect(result.exitLeadTimeDays).toBe(7);
    expect(result.exitReady).toBe(true);
    expect(result.realizedOutcome).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails closed when accepted milestones exceed due milestones', () => {
    const input = baseline();
    input.terms.milestonesAccepted = verifiedCount(5, 'evidence:bad-accepted');

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.deliveryClassification).toBe('UNKNOWN');
    expect(result.terms.milestoneAcceptanceRatePct).toBeNull();
    expect(result.terms.reasons).toContain('milestones:accepted_exceeds_due');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed when no due milestone denominator exists', () => {
    const input = baseline();
    input.terms.milestonesDue = verifiedCount(0, 'evidence:no-due');
    input.terms.milestonesAccepted = verifiedCount(0, 'evidence:no-accepted');

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.deliveryClassification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('milestone_acceptance:zero_due_denominator');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('holds when VERIFIED vendor evidence omits its evidence reference', () => {
    const input = baseline();
    input.terms.actualCostUsd = {
      ...input.terms.actualCostUsd,
      evidenceRefs: [],
    };

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.economicsClassification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('actual_cost_usd:verified_without_evidence');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:economics:unknown');
  });

  it('maps vendor observations into canonical Attack 3000 dimensions', () => {
    const { assessment } = createVendorAttack3000Assessment(baseline());

    expect(assessment.adapterId).toBe(ATTACK_3000_VENDOR_ADAPTER_ID);
    expect(assessment.subject.domain).toBe('vendor-partnership');
    expect(assessment.dimensions.value_created?.evidenceRefs).toEqual(
      expect.arrayContaining([
        'evidence:milestones-due',
        'evidence:milestones-accepted',
        'evidence:realized-outcome',
      ]),
    );
    expect(assessment.dimensions.reversibility?.evidenceRefs).toEqual(
      expect.arrayContaining([
        'evidence:exit-days',
        'evidence:portable-artifacts',
        'evidence:data-export',
        'evidence:replacement-path',
      ]),
    );
  });

  it('supports fully verified partnership evidence but grants zero execution authority', () => {
    const result = evaluateVendorAttack3000(baseline());

    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
    expect(Object.values(result.evaluation.authority).every((value) => value === false)).toBe(true);
  });

  it('does not let accepted deliverables substitute for a realized outcome', () => {
    const input = baseline();
    input.terms.realizedOutcome = verifiedBoolean(false, 'evidence:no-realized-outcome');

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.milestoneAcceptanceRatePct).toBe(100);
    expect(result.assessment.dimensions.value_created?.direction).toBe('CONTRADICTS');
    expect(result.assessment.dimensions.human_outcome?.direction).toBe('CONTRADICTS');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('holds when portability is verified false even if delivery is complete', () => {
    const input = baseline();
    input.terms.artifactsPortable = verifiedBoolean(false, 'evidence:not-portable');

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.exitReady).toBe(false);
    expect(result.assessment.dimensions.dependencies?.direction).toBe('CONTRADICTS');
    expect(result.assessment.dimensions.reversibility?.direction).toBe('CONTRADICTS');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('falsifies when verified milestone acceptance is below the founder floor', () => {
    const input = baseline();
    input.terms.milestonesAccepted = verifiedCount(3, 'evidence:three-accepted');
    input.stopCondition = {
      kind: 'milestone_acceptance_floor',
      floor: {
        value: 80,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:acceptance-floor'],
      },
    };

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.milestoneAcceptanceRatePct).toBeCloseTo(75, 5);
    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
  });

  it('falsifies when verified cost overrun exceeds the founder ceiling', () => {
    const input = baseline();
    input.terms.actualCostUsd = verifiedNumber(1200, 'evidence:actual-cost-1200');
    input.stopCondition = {
      kind: 'max_cost_overrun_pct',
      ceiling: {
        value: 10,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:cost-overrun-ceiling'],
      },
    };

    const result = evaluateVendorAttack3000(input);

    expect(result.terms.costVariancePct).toBeCloseTo(20, 5);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
  });

  it('falsifies when operational burden exceeds the verified ceiling', () => {
    const input = baseline();
    input.terms.monthlyOperationalHours = verifiedNumber(12, 'evidence:twelve-hours');
    input.stopCondition = {
      kind: 'max_operational_hours',
      ceiling: {
        value: 8,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:ops-hours-ceiling'],
      },
    };

    expect(evaluateVendorAttack3000(input).evaluation.verdict).toBe('FALSIFIED');
  });

  it('falsifies when exit lead time exceeds the verified ceiling', () => {
    const input = baseline();
    input.terms.exitLeadTimeDays = verifiedNumber(45, 'evidence:exit-45-days');
    input.stopCondition = {
      kind: 'max_exit_lead_time_days',
      ceiling: {
        value: 30,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:exit-days-ceiling'],
      },
    };

    expect(evaluateVendorAttack3000(input).evaluation.verdict).toBe('FALSIFIED');
  });

  it('can require verified exit readiness without manufacturing contact or spend authority', () => {
    const input = baseline();
    input.terms.replacementPath = verifiedBoolean(false, 'evidence:no-replacement');
    input.stopCondition = {
      kind: 'require_exit_ready',
      requirement: {
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:exit-ready-required'],
      },
    };

    const result = evaluateVendorAttack3000(input);

    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.authority.authorizesExternalContact).toBe(false);
    expect(result.evaluation.authority.authorizesSpend).toBe(false);
  });

  it('does not promote an inferred founder threshold into a verified stop decision', () => {
    const input = baseline();
    input.terms.actualCostUsd = verifiedNumber(1200, 'evidence:actual-cost-1200');
    input.stopCondition = {
      kind: 'max_cost_overrun_pct',
      ceiling: {
        value: 10,
        classification: 'INFERRED',
        evidenceRefs: ['memory:cost-ceiling-not-reconfirmed'],
      },
    };

    const result = evaluateVendorAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.assessment.stopCondition.classification).toBe('INFERRED');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('stop_condition:inferred');
    expect(result.evaluation.reasons).not.toContain('stop_condition:triggered');
  });

  it('preserves an explicit verified stop while retaining the Attack 3000 authority ceiling', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'explicit',
      trigger: verifiedTrigger('Vendor experiment stop is crossed', true),
    };

    const result = evaluateVendorAttack3000(input);

    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
  });
});
