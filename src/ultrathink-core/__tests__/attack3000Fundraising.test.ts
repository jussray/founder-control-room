import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  type Attack3000Evidence,
  type Attack3000Trigger,
} from '../attack3000.js';
import {
  ATTACK_3000_FUNDRAISING_ADAPTER_ID,
  createFundraisingAttack3000Assessment,
  deriveFundraisingOptionality,
  deriveFundraisingTerms,
  evaluateFundraisingAttack3000,
  type FundraisingAttack3000Input,
  type FundraisingCapitalScope,
  type FundraisingMoneyObservation,
} from '../attack3000Fundraising.js';

const SCOPE: FundraisingCapitalScope = {
  projectId: 'project-one',
  legalEntityId: 'entity-one',
  capitalLaneId: 'founder-os-seed',
};
const OBSERVED_AT = '2026-09-05T12:00:00.000Z';
const AS_OF = '2026-09-06T08:00:00.000Z';

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

const verifiedMoney = (amountCents: number, ref: string): FundraisingMoneyObservation => ({
  amountCents,
  currency: 'USD',
  observedAt: OBSERVED_AT,
  scope: { ...SCOPE },
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

function baseline(): FundraisingAttack3000Input {
  return {
    subject: {
      decisionId: 'fundraise-series-seed',
      projectId: 'project-one',
      portfolioId: 'portfolio-juss',
    },
    terms: {
      preMoneyValuation: verifiedMoney(1_000_000_000, 'evidence:pre-money-10m'),
      raiseAmount: verifiedMoney(300_000_000, 'evidence:raise-3m'),
      context: {
        expectedScope: { ...SCOPE },
        asOf: AS_OF,
        maxEvidenceAgeDays: 30,
      },
    },
    termBurden: {
      instrument: 'priced-equity',
      economicRightsKnown: true,
      controlRightsKnown: true,
      scope: { ...SCOPE },
      classification: 'VERIFIED',
      evidenceRefs: ['evidence:term-sheet-rights'],
    },
    optionality: {
      before: ['bootstrap', 'strategic acquisition', 'follow-on raise'],
      after: ['strategic acquisition', 'follow-on raise'],
      scope: { ...SCOPE },
      classification: 'VERIFIED',
      evidenceRefs: ['evidence:option-set-review'],
    },
    evidence: {
      valueCreated: verifiedSupport('evidence:milestone-value'),
      humanOutcome: verifiedSupport('evidence:human-outcome'),
      externalDemand: verifiedSupport('evidence:external-demand'),
      economics: verifiedSupport('evidence:capital-efficiency'),
      opportunityCost: verifiedSupport('evidence:financing-alternatives'),
      dependencies: verifiedSupport('evidence:execution-dependencies'),
      reversibility: verifiedSupport('evidence:financing-reversibility'),
      secondOrderEffects: verifiedSupport('evidence:dilution-effects'),
      thirdOrderEffects: verifiedSupport('evidence:future-round-effects'),
    },
    falsifier: verifiedTrigger('Milestone thesis is disproved'),
    stopCondition: {
      kind: 'explicit',
      trigger: verifiedTrigger('Founder capital stop condition is crossed'),
    },
  };
}

describe('Attack 3000 fundraising evidence adapter', () => {
  it('derives post-money valuation and dilution without promoting arithmetic into authority', () => {
    const result = deriveFundraisingTerms(baseline().terms);

    expect(result.classification).toBe('VERIFIED');
    expect(result.currency).toBe('USD');
    expect(result.postMoneyValuationCents).toBe(1_300_000_000);
    expect(result.impliedDilutionPct).toBeCloseTo(23.076923, 5);
    expect(result.retainedOwnershipPct).toBeCloseTo(76.923077, 5);
    expect(result.reasons).toEqual([]);
  });

  it('maps fundraising evidence into the canonical Attack 3000 dimensions', () => {
    const { assessment, optionality, termBurden } = createFundraisingAttack3000Assessment(baseline());

    expect(assessment.adapterId).toBe(ATTACK_3000_FUNDRAISING_ADAPTER_ID);
    expect(assessment.subject.domain).toBe('fundraising');
    expect(assessment.dimensions.value_created?.evidenceRefs).toContain('evidence:milestone-value');
    expect(assessment.dimensions.external_demand?.evidenceRefs).toContain('evidence:external-demand');
    expect(assessment.dimensions.economics?.evidenceRefs).toEqual(
      expect.arrayContaining([
        'evidence:capital-efficiency',
        'evidence:pre-money-10m',
        'evidence:raise-3m',
        'evidence:term-sheet-rights',
      ]),
    );
    expect(assessment.dimensions.opportunity_cost?.evidenceRefs).toContain('evidence:option-set-review');
    expect(termBurden.completeness).toBe('COMPLETE');
    expect(optionality.state).toBe('CONSTRAINED');
    expect(optionality.weakenedOptions).toEqual(['bootstrap']);
  });

  it('supports a fully verified financing case but still grants zero execution authority', () => {
    const result = evaluateFundraisingAttack3000(baseline());

    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.optionality.state).toBe('CONSTRAINED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
    expect(Object.values(result.evaluation.authority).every((value) => value === false)).toBe(true);
  });

  it('holds when a financing term is inferred even if its arithmetic is computable', () => {
    const input = baseline();
    input.terms.preMoneyValuation = {
      ...input.terms.preMoneyValuation,
      classification: 'INFERRED',
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('INFERRED');
    expect(result.terms.impliedDilutionPct).toBeCloseTo(23.076923, 5);
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:economics:inferred');
  });

  it('holds when a term claims VERIFIED without an evidence reference', () => {
    const input = baseline();
    input.terms.raiseAmount = {
      ...input.terms.raiseAmount,
      evidenceRefs: [],
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.impliedDilutionPct).toBeNull();
    expect(result.terms.reasons).toContain('raise_amount:verified_without_evidence');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:economics:unknown');
  });

  it('fails closed on invalid financing amounts', () => {
    const input = baseline();
    input.terms.raiseAmount = verifiedMoney(-1, 'evidence:bad-raise');

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.postMoneyValuationCents).toBeNull();
    expect(result.terms.impliedDilutionPct).toBeNull();
    expect(result.terms.reasons).toContain('raise_amount:invalid_amount');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed when money observations use different currencies', () => {
    const input = baseline();
    input.terms.raiseAmount = {
      ...input.terms.raiseAmount,
      currency: 'EUR',
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.currency).toBeNull();
    expect(result.terms.impliedDilutionPct).toBeNull();
    expect(result.terms.reasons).toContain('terms:currency_mismatch');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed on stale money evidence instead of reusing old runway economics', () => {
    const input = baseline();
    input.terms.preMoneyValuation = {
      ...input.terms.preMoneyValuation,
      observedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.postMoneyValuationCents).toBeNull();
    expect(result.terms.reasons).toContain('pre_money:stale_evidence');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed when financing evidence comes from a different legal entity or capital lane', () => {
    const input = baseline();
    input.terms.raiseAmount = {
      ...input.terms.raiseAmount,
      scope: {
        ...SCOPE,
        legalEntityId: 'entity-two',
      },
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('raise_amount:scope_mismatch');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('fails closed when the assessment subject project does not match the capital scope', () => {
    const input = baseline();
    input.subject = {
      ...input.subject,
      projectId: 'project-two',
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.postMoneyValuationCents).toBeNull();
    expect(result.terms.reasons).toContain('subject:project_scope_mismatch');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('holds when valuation is known but economic or control rights are not', () => {
    const input = baseline();
    input.termBurden = {
      ...input.termBurden!,
      controlRightsKnown: false,
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.termBurden.classification).toBe('UNKNOWN');
    expect(result.termBurden.completeness).toBe('INCOMPLETE');
    expect(result.termBurden.reasons).toContain('term_burden:control_rights_unknown');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:economics:unknown');
  });

  it('holds when non-dilution financing terms are missing entirely', () => {
    const input = baseline();
    input.termBurden = undefined;

    const result = evaluateFundraisingAttack3000(input);

    expect(result.termBurden.classification).toBe('UNKNOWN');
    expect(result.termBurden.reasons).toContain('term_burden:missing');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('classifies option-set change without manufacturing a score or automatic financing authority', () => {
    const input = baseline();
    const optionality = deriveFundraisingOptionality(input.optionality, SCOPE);

    expect(optionality.state).toBe('CONSTRAINED');
    expect(optionality.preservedOptions).toEqual(['strategic acquisition', 'follow-on raise']);
    expect(optionality.weakenedOptions).toEqual(['bootstrap']);
    expect(optionality.addedOptions).toEqual([]);

    const result = evaluateFundraisingAttack3000(input);
    expect(result.evaluation.authority.authorizesFundraise).toBe(false);
  });

  it('holds when the future option set is missing instead of assuming optionality is preserved', () => {
    const input = baseline();
    input.optionality = undefined;

    const result = evaluateFundraisingAttack3000(input);

    expect(result.optionality.state).toBe('UNKNOWN');
    expect(result.optionality.reasons).toContain('optionality:missing');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:opportunity_cost:unknown');
  });

  it('holds when the option-set comparison is inferred even though the set difference is computable', () => {
    const input = baseline();
    input.optionality = {
      ...input.optionality!,
      classification: 'INFERRED',
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.optionality.state).toBe('CONSTRAINED');
    expect(result.optionality.classification).toBe('INFERRED');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('dimension:opportunity_cost:inferred');
  });

  it('holds when deterministic freshness context is missing', () => {
    const input = baseline();
    input.terms.context = undefined;

    const result = evaluateFundraisingAttack3000(input);

    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('terms_context:missing');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('keeps a verified dilution ceiling below the implied dilution from silently passing', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'dilution_ceiling',
      ceiling: {
        maxDilutionPct: 20,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:founder-20pct-ceiling'],
      },
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
  });

  it('permits a verified dilution ceiling above the implied dilution to remain eligible for support', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'dilution_ceiling',
      ceiling: {
        maxDilutionPct: 25,
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:founder-25pct-ceiling'],
      },
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(false);
    expect(result.evaluation.verdict).toBe('SUPPORTED');
  });

  it('does not treat an unverified dilution ceiling as a verified stop decision', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'dilution_ceiling',
      ceiling: {
        maxDilutionPct: 20,
        classification: 'INFERRED',
        evidenceRefs: ['memory:founder-ceiling-not-reconfirmed'],
      },
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.assessment.stopCondition.classification).toBe('INFERRED');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('stop_condition:inferred');
    expect(result.evaluation.reasons).not.toContain('stop_condition:triggered');
  });

  it('preserves an explicit verified stop condition as a falsifier of the financing decision', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'explicit',
      trigger: verifiedTrigger('Runway stop condition is crossed', true),
    };

    const result = evaluateFundraisingAttack3000(input);

    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
    expect(result.evaluation.authority.authorizesFundraise).toBe(false);
  });
});
