import {
  ATTACK_3000_SCHEMA,
  evaluateAttack3000,
  type Attack3000Assessment,
  type Attack3000Evaluation,
  type Attack3000Evidence,
  type Attack3000Reality,
  type Attack3000Subject,
  type Attack3000Trigger,
} from './attack3000.js';

export const ATTACK_3000_COMMERCE_ADAPTER_ID = 'commerce-unit-economics@v1' as const;

export interface CommerceMoneyObservation {
  amountCents: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface CommerceTermsInput {
  unitRevenue: CommerceMoneyObservation;
  unitCogs: CommerceMoneyObservation;
  variableFulfillmentCost: CommerceMoneyObservation;
  variableAcquisitionCost: CommerceMoneyObservation;
  cashLockedPerUnit: CommerceMoneyObservation;
}

export interface CommerceTermsDerivation {
  classification: Attack3000Reality;
  grossProfitCents: number | null;
  grossMarginPct: number | null;
  contributionProfitCents: number | null;
  contributionMarginPct: number | null;
  cashLockedPerUnitCents: number | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface CommerceAttack3000Evidence {
  valueCreated: Attack3000Evidence;
  humanOutcome: Attack3000Evidence;
  externalDemand: Attack3000Evidence;
  economics: Attack3000Evidence;
  opportunityCost: Attack3000Evidence;
  dependencies: Attack3000Evidence;
  reversibility: Attack3000Evidence;
  secondOrderEffects: Attack3000Evidence;
  thirdOrderEffects: Attack3000Evidence;
}

export interface CommerceContributionMarginFloor {
  minContributionMarginPct: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface CommerceCashLockupCeiling {
  maxCashLockedPerUnitCents: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type CommerceStopCondition =
  | {
      kind: 'explicit';
      trigger: Attack3000Trigger;
    }
  | {
      kind: 'contribution_margin_floor';
      floor: CommerceContributionMarginFloor;
    }
  | {
      kind: 'cash_lockup_ceiling';
      ceiling: CommerceCashLockupCeiling;
    };

export interface CommerceAttack3000Input {
  subject: Omit<Attack3000Subject, 'domain'>;
  terms: CommerceTermsInput;
  evidence: CommerceAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: CommerceStopCondition;
}

export interface CommerceAttack3000Result {
  terms: CommerceTermsDerivation;
  assessment: Attack3000Assessment;
  evaluation: Attack3000Evaluation;
}

const REALITY_RANK: Readonly<Record<Attack3000Reality, number>> = {
  VERIFIED: 0,
  INFERRED: 1,
  UNKNOWN: 2,
  BLOCKED: 3,
};

function weakestReality(...values: Attack3000Reality[]): Attack3000Reality {
  return values.reduce<Attack3000Reality>(
    (worst, current) => (REALITY_RANK[current] > REALITY_RANK[worst] ? current : worst),
    'VERIFIED',
  );
}

function cleanRefs(refs: readonly string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
}

function hasEvidence(refs: readonly string[]): boolean {
  return cleanRefs(refs).length > 0;
}

function validMoney(amountCents: number | null, allowZero: boolean): boolean {
  if (amountCents === null || !Number.isSafeInteger(amountCents)) return false;
  return allowZero ? amountCents >= 0 : amountCents > 0;
}

type CommerceMoneyLabel =
  | 'unit_revenue'
  | 'unit_cogs'
  | 'variable_fulfillment_cost'
  | 'variable_acquisition_cost'
  | 'cash_locked_per_unit';

function observationReality(
  label: CommerceMoneyLabel,
  observation: CommerceMoneyObservation,
  allowZero: boolean,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = observation.classification;

  if (!validMoney(observation.amountCents, allowZero)) {
    reasons.add(`${label}:invalid_amount`);
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add(`${label}:verified_without_evidence`);
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification !== 'VERIFIED') {
    reasons.add(`${label}:${observation.classification.toLowerCase()}`);
  }

  return classification;
}

/**
 * Derives unit economics only from supplied observations. Calculated margin is
 * not stronger than its weakest source observation, so a spreadsheet formula
 * cannot manufacture VERIFIED business evidence from inferred inputs.
 */
export function deriveCommerceTerms(input: CommerceTermsInput): CommerceTermsDerivation {
  const reasons = new Set<string>();
  const revenueReality = observationReality('unit_revenue', input.unitRevenue, false, reasons);
  const cogsReality = observationReality('unit_cogs', input.unitCogs, true, reasons);
  const fulfillmentReality = observationReality(
    'variable_fulfillment_cost',
    input.variableFulfillmentCost,
    true,
    reasons,
  );
  const acquisitionReality = observationReality(
    'variable_acquisition_cost',
    input.variableAcquisitionCost,
    true,
    reasons,
  );
  const cashReality = observationReality(
    'cash_locked_per_unit',
    input.cashLockedPerUnit,
    true,
    reasons,
  );

  const classification = weakestReality(
    revenueReality,
    cogsReality,
    fulfillmentReality,
    acquisitionReality,
    cashReality,
  );
  const evidenceRefs = cleanRefs([
    ...input.unitRevenue.evidenceRefs,
    ...input.unitCogs.evidenceRefs,
    ...input.variableFulfillmentCost.evidenceRefs,
    ...input.variableAcquisitionCost.evidenceRefs,
    ...input.cashLockedPerUnit.evidenceRefs,
  ]);

  const revenue = input.unitRevenue.amountCents;
  const cogs = input.unitCogs.amountCents;
  const fulfillment = input.variableFulfillmentCost.amountCents;
  const acquisition = input.variableAcquisitionCost.amountCents;
  const cashLocked = input.cashLockedPerUnit.amountCents;

  if (
    !validMoney(revenue, false) ||
    !validMoney(cogs, true) ||
    !validMoney(fulfillment, true) ||
    !validMoney(acquisition, true) ||
    !validMoney(cashLocked, true)
  ) {
    return {
      classification,
      grossProfitCents: null,
      grossMarginPct: null,
      contributionProfitCents: null,
      contributionMarginPct: null,
      cashLockedPerUnitCents: null,
      evidenceRefs,
      reasons: [...reasons],
    };
  }

  const grossProfitCents = revenue! - cogs!;
  const contributionProfitCents = grossProfitCents - fulfillment! - acquisition!;
  if (!Number.isSafeInteger(grossProfitCents) || !Number.isSafeInteger(contributionProfitCents)) {
    reasons.add('unit_economics:unsafe_integer');
    return {
      classification: weakestReality(classification, 'UNKNOWN'),
      grossProfitCents: null,
      grossMarginPct: null,
      contributionProfitCents: null,
      contributionMarginPct: null,
      cashLockedPerUnitCents: null,
      evidenceRefs,
      reasons: [...reasons],
    };
  }

  return {
    classification,
    grossProfitCents,
    grossMarginPct: (grossProfitCents / revenue!) * 100,
    contributionProfitCents,
    contributionMarginPct: (contributionProfitCents / revenue!) * 100,
    cashLockedPerUnitCents: cashLocked!,
    evidenceRefs,
    reasons: [...reasons],
  };
}

function thresholdReality(
  label: 'contribution_margin_floor' | 'cash_lockup_ceiling',
  classification: Attack3000Reality,
  evidenceRefs: readonly string[],
  valid: boolean,
): Attack3000Reality {
  let reality = classification;
  if (!valid) reality = weakestReality(reality, 'UNKNOWN');
  if (classification === 'VERIFIED' && !hasEvidence(evidenceRefs)) {
    reality = weakestReality(reality, 'UNKNOWN');
  }
  return reality;
}

function buildContributionMarginStopCondition(
  terms: CommerceTermsDerivation,
  floor: CommerceContributionMarginFloor,
): Attack3000Trigger {
  const validFloor = Number.isFinite(floor.minContributionMarginPct);
  const floorReality = thresholdReality(
    'contribution_margin_floor',
    floor.classification,
    floor.evidenceRefs,
    validFloor,
  );
  const classification = weakestReality(terms.classification, floorReality);

  return {
    statement: `Stop if contribution margin falls below the founder-defined floor of ${floor.minContributionMarginPct}%.`,
    classification,
    triggered:
      validFloor &&
      terms.contributionMarginPct !== null &&
      terms.contributionMarginPct < floor.minContributionMarginPct,
    evidenceRefs: cleanRefs([...terms.evidenceRefs, ...floor.evidenceRefs]),
  };
}

function buildCashLockupStopCondition(
  terms: CommerceTermsDerivation,
  ceiling: CommerceCashLockupCeiling,
): Attack3000Trigger {
  const validCeiling =
    Number.isSafeInteger(ceiling.maxCashLockedPerUnitCents) &&
    ceiling.maxCashLockedPerUnitCents >= 0;
  const ceilingReality = thresholdReality(
    'cash_lockup_ceiling',
    ceiling.classification,
    ceiling.evidenceRefs,
    validCeiling,
  );
  const classification = weakestReality(terms.classification, ceilingReality);

  return {
    statement: `Stop if cash locked per unit exceeds the founder-defined ceiling of ${ceiling.maxCashLockedPerUnitCents} cents.`,
    classification,
    triggered:
      validCeiling &&
      terms.cashLockedPerUnitCents !== null &&
      terms.cashLockedPerUnitCents > ceiling.maxCashLockedPerUnitCents,
    evidenceRefs: cleanRefs([...terms.evidenceRefs, ...ceiling.evidenceRefs]),
  };
}

function economicsEvidence(
  evidence: Attack3000Evidence,
  terms: CommerceTermsDerivation,
): Attack3000Evidence {
  const metricSummary =
    terms.grossMarginPct !== null && terms.contributionMarginPct !== null
      ? `grossMarginPct=${terms.grossMarginPct}; contributionMarginPct=${terms.contributionMarginPct}; cashLockedPerUnitCents=${terms.cashLockedPerUnitCents}`
      : 'commerce terms could not be fully derived';

  return {
    ...evidence,
    classification: weakestReality(evidence.classification, terms.classification),
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...terms.evidenceRefs]),
    note: [evidence.note?.trim(), `${metricSummary}; termClassification=${terms.classification}`]
      .filter(Boolean)
      .join(' | '),
  };
}

export function createCommerceAttack3000Assessment(
  input: CommerceAttack3000Input,
): { terms: CommerceTermsDerivation; assessment: Attack3000Assessment } {
  const terms = deriveCommerceTerms(input.terms);
  let stopCondition: Attack3000Trigger;

  if (input.stopCondition.kind === 'explicit') {
    stopCondition = input.stopCondition.trigger;
  } else if (input.stopCondition.kind === 'contribution_margin_floor') {
    stopCondition = buildContributionMarginStopCondition(terms, input.stopCondition.floor);
  } else {
    stopCondition = buildCashLockupStopCondition(terms, input.stopCondition.ceiling);
  }

  return {
    terms,
    assessment: {
      schema: ATTACK_3000_SCHEMA,
      subject: {
        ...input.subject,
        domain: 'commerce',
      },
      adapterId: ATTACK_3000_COMMERCE_ADAPTER_ID,
      dimensions: {
        value_created: input.evidence.valueCreated,
        human_outcome: input.evidence.humanOutcome,
        external_demand: input.evidence.externalDemand,
        economics: economicsEvidence(input.evidence.economics, terms),
        opportunity_cost: input.evidence.opportunityCost,
        dependencies: input.evidence.dependencies,
        reversibility: input.evidence.reversibility,
        second_order_effects: input.evidence.secondOrderEffects,
        third_order_effects: input.evidence.thirdOrderEffects,
      },
      falsifier: input.falsifier,
      stopCondition,
    },
  };
}

export function evaluateCommerceAttack3000(
  input: CommerceAttack3000Input,
): CommerceAttack3000Result {
  const { terms, assessment } = createCommerceAttack3000Assessment(input);
  return {
    terms,
    assessment,
    evaluation: evaluateAttack3000(assessment),
  };
}
