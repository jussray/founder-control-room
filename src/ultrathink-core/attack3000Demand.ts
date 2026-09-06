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

export const ATTACK_3000_DEMAND_ADAPTER_ID = 'product-customer-demand@v1' as const;

export interface DemandCountObservation {
  count: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface DemandTermsInput {
  exposedUsers: DemandCountObservation;
  activatedUsers: DemandCountObservation;
  repeatUsers: DemandCountObservation;
  buyersOffered: DemandCountObservation;
  payingBuyers: DemandCountObservation;
}

export interface DemandTermsDerivation {
  classification: Attack3000Reality;
  activationRatePct: number | null;
  repeatRatePct: number | null;
  paidConversionPct: number | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface DemandAttack3000Evidence {
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

export interface DemandRateFloor {
  minRatePct: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type DemandStopCondition =
  | { kind: 'explicit'; trigger: Attack3000Trigger }
  | { kind: 'activation_rate_floor'; floor: DemandRateFloor }
  | { kind: 'repeat_rate_floor'; floor: DemandRateFloor }
  | { kind: 'paid_conversion_floor'; floor: DemandRateFloor };

export interface DemandAttack3000Input {
  subject: Omit<Attack3000Subject, 'domain'>;
  terms: DemandTermsInput;
  evidence: DemandAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: DemandStopCondition;
}

export interface DemandAttack3000Result {
  terms: DemandTermsDerivation;
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

function validCount(count: number | null): boolean {
  return count !== null && Number.isSafeInteger(count) && count >= 0;
}

type DemandCountLabel =
  | 'exposed_users'
  | 'activated_users'
  | 'repeat_users'
  | 'buyers_offered'
  | 'paying_buyers';

function observationReality(
  label: DemandCountLabel,
  observation: DemandCountObservation,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = observation.classification;

  if (!validCount(observation.count)) {
    reasons.add(`${label}:invalid_count`);
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
 * User behavior and buyer behavior are deliberately separate cohorts. A payer
 * can be a parent, school, employer, or other buyer rather than the end user.
 * The adapter therefore never compares payingBuyers with activatedUsers.
 */
export function deriveDemandTerms(input: DemandTermsInput): DemandTermsDerivation {
  const reasons = new Set<string>();
  const realities = [
    observationReality('exposed_users', input.exposedUsers, reasons),
    observationReality('activated_users', input.activatedUsers, reasons),
    observationReality('repeat_users', input.repeatUsers, reasons),
    observationReality('buyers_offered', input.buyersOffered, reasons),
    observationReality('paying_buyers', input.payingBuyers, reasons),
  ];
  let classification = weakestReality(...realities);
  const evidenceRefs = cleanRefs([
    ...input.exposedUsers.evidenceRefs,
    ...input.activatedUsers.evidenceRefs,
    ...input.repeatUsers.evidenceRefs,
    ...input.buyersOffered.evidenceRefs,
    ...input.payingBuyers.evidenceRefs,
  ]);

  const exposed = input.exposedUsers.count;
  const activated = input.activatedUsers.count;
  const repeat = input.repeatUsers.count;
  const offered = input.buyersOffered.count;
  const paying = input.payingBuyers.count;

  if (![exposed, activated, repeat, offered, paying].every(validCount)) {
    return {
      classification,
      activationRatePct: null,
      repeatRatePct: null,
      paidConversionPct: null,
      evidenceRefs,
      reasons: [...reasons],
    };
  }

  let structurallyValid = true;
  if (activated! > exposed!) {
    reasons.add('user_cohort:activated_exceeds_exposed');
    structurallyValid = false;
  }
  if (repeat! > activated!) {
    reasons.add('user_cohort:repeat_exceeds_activated');
    structurallyValid = false;
  }
  if (paying! > offered!) {
    reasons.add('buyer_cohort:paying_exceeds_offered');
    structurallyValid = false;
  }
  if (exposed! === 0) {
    reasons.add('activation_rate:zero_exposed_denominator');
    structurallyValid = false;
  }
  if (activated! === 0) {
    reasons.add('repeat_rate:zero_activated_denominator');
    structurallyValid = false;
  }
  if (offered! === 0) {
    reasons.add('paid_conversion:zero_offered_denominator');
    structurallyValid = false;
  }

  if (!structurallyValid) {
    classification = weakestReality(classification, 'UNKNOWN');
    return {
      classification,
      activationRatePct: null,
      repeatRatePct: null,
      paidConversionPct: null,
      evidenceRefs,
      reasons: [...reasons],
    };
  }

  return {
    classification,
    activationRatePct: (activated! / exposed!) * 100,
    repeatRatePct: (repeat! / activated!) * 100,
    paidConversionPct: (paying! / offered!) * 100,
    evidenceRefs,
    reasons: [...reasons],
  };
}

function normalizeRateFloor(floor: DemandRateFloor): Attack3000Reality {
  const validRate = Number.isFinite(floor.minRatePct) && floor.minRatePct >= 0 && floor.minRatePct <= 100;
  let classification = floor.classification;
  if (!validRate) classification = weakestReality(classification, 'UNKNOWN');
  if (floor.classification === 'VERIFIED' && !hasEvidence(floor.evidenceRefs)) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

function buildRateFloorStopCondition(
  terms: DemandTermsDerivation,
  metric: number | null,
  metricName: 'activation rate' | 'repeat rate' | 'paid conversion rate',
  floor: DemandRateFloor,
): Attack3000Trigger {
  const validRate = Number.isFinite(floor.minRatePct) && floor.minRatePct >= 0 && floor.minRatePct <= 100;
  return {
    statement: `Stop if ${metricName} falls below the founder-defined floor of ${floor.minRatePct}%.`,
    classification: weakestReality(terms.classification, normalizeRateFloor(floor)),
    triggered: validRate && metric !== null && metric < floor.minRatePct,
    evidenceRefs: cleanRefs([...terms.evidenceRefs, ...floor.evidenceRefs]),
  };
}

function externalDemandEvidence(
  evidence: Attack3000Evidence,
  terms: DemandTermsDerivation,
): Attack3000Evidence {
  const summary =
    terms.activationRatePct !== null &&
    terms.repeatRatePct !== null &&
    terms.paidConversionPct !== null
      ? `activationRatePct=${terms.activationRatePct}; repeatRatePct=${terms.repeatRatePct}; paidConversionPct=${terms.paidConversionPct}`
      : 'demand rates could not be fully derived';

  return {
    ...evidence,
    classification: weakestReality(evidence.classification, terms.classification),
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...terms.evidenceRefs]),
    note: [evidence.note?.trim(), `${summary}; termClassification=${terms.classification}`]
      .filter(Boolean)
      .join(' | '),
  };
}

export function createDemandAttack3000Assessment(
  input: DemandAttack3000Input,
): { terms: DemandTermsDerivation; assessment: Attack3000Assessment } {
  const terms = deriveDemandTerms(input.terms);
  let stopCondition: Attack3000Trigger;

  if (input.stopCondition.kind === 'explicit') {
    stopCondition = input.stopCondition.trigger;
  } else if (input.stopCondition.kind === 'activation_rate_floor') {
    stopCondition = buildRateFloorStopCondition(
      terms,
      terms.activationRatePct,
      'activation rate',
      input.stopCondition.floor,
    );
  } else if (input.stopCondition.kind === 'repeat_rate_floor') {
    stopCondition = buildRateFloorStopCondition(
      terms,
      terms.repeatRatePct,
      'repeat rate',
      input.stopCondition.floor,
    );
  } else {
    stopCondition = buildRateFloorStopCondition(
      terms,
      terms.paidConversionPct,
      'paid conversion rate',
      input.stopCondition.floor,
    );
  }

  return {
    terms,
    assessment: {
      schema: ATTACK_3000_SCHEMA,
      subject: { ...input.subject, domain: 'product-demand' },
      adapterId: ATTACK_3000_DEMAND_ADAPTER_ID,
      dimensions: {
        value_created: input.evidence.valueCreated,
        human_outcome: input.evidence.humanOutcome,
        external_demand: externalDemandEvidence(input.evidence.externalDemand, terms),
        economics: input.evidence.economics,
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

export function evaluateDemandAttack3000(input: DemandAttack3000Input): DemandAttack3000Result {
  const { terms, assessment } = createDemandAttack3000Assessment(input);
  return {
    terms,
    assessment,
    evaluation: evaluateAttack3000(assessment),
  };
}
