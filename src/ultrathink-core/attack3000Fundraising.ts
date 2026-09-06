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

export const ATTACK_3000_FUNDRAISING_ADAPTER_ID = 'fundraising-capital-milestone@v1' as const;

export interface FundraisingMoneyObservation {
  amountCents: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface FundraisingDilutionCeiling {
  maxDilutionPct: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface FundraisingTermsInput {
  preMoneyValuation: FundraisingMoneyObservation;
  raiseAmount: FundraisingMoneyObservation;
}

export interface FundraisingTermsDerivation {
  classification: Attack3000Reality;
  postMoneyValuationCents: number | null;
  impliedDilutionPct: number | null;
  retainedOwnershipPct: number | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface FundraisingAttack3000Evidence {
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

export type FundraisingStopCondition =
  | {
      kind: 'explicit';
      trigger: Attack3000Trigger;
    }
  | {
      kind: 'dilution_ceiling';
      ceiling: FundraisingDilutionCeiling;
    };

export interface FundraisingAttack3000Input {
  subject: Omit<Attack3000Subject, 'domain'>;
  terms: FundraisingTermsInput;
  evidence: FundraisingAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: FundraisingStopCondition;
}

export interface FundraisingAttack3000Result {
  terms: FundraisingTermsDerivation;
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
  return values.reduce<Attack3000Reality>((worst, current) =>
    REALITY_RANK[current] > REALITY_RANK[worst] ? current : worst,
  'VERIFIED');
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

function observationReality(
  label: 'pre_money' | 'raise_amount',
  observation: FundraisingMoneyObservation,
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
 * Derives only arithmetic from the supplied financing terms. The classification
 * travels with the terms so calculated dilution cannot be mistaken for verified
 * economics when the source observations are inferred, unknown, blocked, or
 * missing evidence.
 */
export function deriveFundraisingTerms(input: FundraisingTermsInput): FundraisingTermsDerivation {
  const reasons = new Set<string>();
  const preMoneyReality = observationReality('pre_money', input.preMoneyValuation, true, reasons);
  const raiseReality = observationReality('raise_amount', input.raiseAmount, false, reasons);
  const classification = weakestReality(preMoneyReality, raiseReality);
  const evidenceRefs = cleanRefs([
    ...input.preMoneyValuation.evidenceRefs,
    ...input.raiseAmount.evidenceRefs,
  ]);

  const preMoney = input.preMoneyValuation.amountCents;
  const raiseAmount = input.raiseAmount.amountCents;
  if (!validMoney(preMoney, true) || !validMoney(raiseAmount, false)) {
    return {
      classification,
      postMoneyValuationCents: null,
      impliedDilutionPct: null,
      retainedOwnershipPct: null,
      evidenceRefs,
      reasons: [...reasons],
    };
  }

  const postMoneyValuationCents = preMoney! + raiseAmount!;
  if (!Number.isSafeInteger(postMoneyValuationCents) || postMoneyValuationCents <= 0) {
    reasons.add('post_money:invalid_amount');
    return {
      classification: weakestReality(classification, 'UNKNOWN'),
      postMoneyValuationCents: null,
      impliedDilutionPct: null,
      retainedOwnershipPct: null,
      evidenceRefs,
      reasons: [...reasons],
    };
  }

  const impliedDilutionPct = (raiseAmount! / postMoneyValuationCents) * 100;
  const retainedOwnershipPct = 100 - impliedDilutionPct;

  return {
    classification,
    postMoneyValuationCents,
    impliedDilutionPct,
    retainedOwnershipPct,
    evidenceRefs,
    reasons: [...reasons],
  };
}

function normalizeCeilingReality(
  ceiling: FundraisingDilutionCeiling,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = ceiling.classification;
  const validPercentage =
    Number.isFinite(ceiling.maxDilutionPct) &&
    ceiling.maxDilutionPct >= 0 &&
    ceiling.maxDilutionPct <= 100;

  if (!validPercentage) {
    reasons.add('dilution_ceiling:invalid_percentage');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (ceiling.classification === 'VERIFIED' && !hasEvidence(ceiling.evidenceRefs)) {
    reasons.add('dilution_ceiling:verified_without_evidence');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (ceiling.classification !== 'VERIFIED') {
    reasons.add(`dilution_ceiling:${ceiling.classification.toLowerCase()}`);
  }

  return classification;
}

function buildDilutionStopCondition(
  terms: FundraisingTermsDerivation,
  ceiling: FundraisingDilutionCeiling,
): Attack3000Trigger {
  const reasons = new Set<string>();
  const ceilingReality = normalizeCeilingReality(ceiling, reasons);
  const classification = weakestReality(terms.classification, ceilingReality);
  const validPercentage =
    Number.isFinite(ceiling.maxDilutionPct) &&
    ceiling.maxDilutionPct >= 0 &&
    ceiling.maxDilutionPct <= 100;
  const triggered =
    validPercentage &&
    terms.impliedDilutionPct !== null &&
    terms.impliedDilutionPct > ceiling.maxDilutionPct;

  return {
    statement: `Stop if implied dilution exceeds the founder-defined ceiling of ${ceiling.maxDilutionPct}%.`,
    classification,
    triggered,
    evidenceRefs: cleanRefs([...terms.evidenceRefs, ...ceiling.evidenceRefs]),
  };
}

function economicsEvidence(
  evidence: Attack3000Evidence,
  terms: FundraisingTermsDerivation,
): Attack3000Evidence {
  const termSummary =
    terms.postMoneyValuationCents !== null && terms.impliedDilutionPct !== null
      ? `postMoneyCents=${terms.postMoneyValuationCents}; impliedDilutionPct=${terms.impliedDilutionPct}`
      : 'financing terms could not be fully derived';

  return {
    ...evidence,
    classification: weakestReality(evidence.classification, terms.classification),
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...terms.evidenceRefs]),
    note: [evidence.note?.trim(), `${termSummary}; termClassification=${terms.classification}`]
      .filter(Boolean)
      .join(' | '),
  };
}

export function createFundraisingAttack3000Assessment(
  input: FundraisingAttack3000Input,
): { terms: FundraisingTermsDerivation; assessment: Attack3000Assessment } {
  const terms = deriveFundraisingTerms(input.terms);
  const stopCondition =
    input.stopCondition.kind === 'explicit'
      ? input.stopCondition.trigger
      : buildDilutionStopCondition(terms, input.stopCondition.ceiling);

  return {
    terms,
    assessment: {
      schema: ATTACK_3000_SCHEMA,
      subject: {
        ...input.subject,
        domain: 'fundraising',
      },
      adapterId: ATTACK_3000_FUNDRAISING_ADAPTER_ID,
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

export function evaluateFundraisingAttack3000(
  input: FundraisingAttack3000Input,
): FundraisingAttack3000Result {
  const { terms, assessment } = createFundraisingAttack3000Assessment(input);
  return {
    terms,
    assessment,
    evaluation: evaluateAttack3000(assessment),
  };
}
