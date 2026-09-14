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

export interface FundraisingCapitalScope {
  projectId: string;
  legalEntityId: string;
  capitalLaneId: string;
}

export interface FundraisingMoneyObservation {
  amountCents: number | null;
  currency?: string;
  observedAt?: string;
  scope?: FundraisingCapitalScope;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface FundraisingTermsContext {
  expectedScope: FundraisingCapitalScope;
  asOf: string;
  maxEvidenceAgeDays: number;
}

export interface FundraisingTermBurdenObservation {
  instrument?: string;
  economicRightsKnown: boolean;
  controlRightsKnown: boolean;
  scope?: FundraisingCapitalScope;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type FundraisingTermBurdenCompleteness = 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN' | 'BLOCKED';

export interface FundraisingTermBurdenDerivation {
  classification: Attack3000Reality;
  completeness: FundraisingTermBurdenCompleteness;
  instrument: string | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface FundraisingOptionSetObservation {
  before: readonly string[];
  after: readonly string[];
  scope?: FundraisingCapitalScope;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type FundraisingOptionalityState =
  | 'PRESERVED'
  | 'EXPANDED'
  | 'CONSTRAINED'
  | 'MIXED'
  | 'UNKNOWN'
  | 'BLOCKED';

export interface FundraisingOptionalityDerivation {
  classification: Attack3000Reality;
  state: FundraisingOptionalityState;
  preservedOptions: readonly string[];
  weakenedOptions: readonly string[];
  addedOptions: readonly string[];
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface FundraisingDilutionCeiling {
  maxDilutionPct: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface FundraisingTermsInput {
  preMoneyValuation: FundraisingMoneyObservation;
  raiseAmount: FundraisingMoneyObservation;
  context?: FundraisingTermsContext;
}

export interface FundraisingTermsDerivation {
  classification: Attack3000Reality;
  currency: string | null;
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
  termBurden?: FundraisingTermBurdenObservation;
  optionality?: FundraisingOptionSetObservation;
  evidence: FundraisingAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: FundraisingStopCondition;
}

export interface FundraisingAttack3000Result {
  terms: FundraisingTermsDerivation;
  termBurden: FundraisingTermBurdenDerivation;
  optionality: FundraisingOptionalityDerivation;
  assessment: Attack3000Assessment;
  evaluation: Attack3000Evaluation;
}

const REALITY_RANK: Readonly<Record<Attack3000Reality, number>> = {
  VERIFIED: 0,
  INFERRED: 1,
  UNKNOWN: 2,
  BLOCKED: 3,
};

interface TermsContextValidation {
  classification: Attack3000Reality;
  valid: boolean;
  asOfMs: number | null;
  maxEvidenceAgeMs: number | null;
  expectedScope: FundraisingCapitalScope | null;
}

interface MoneyObservationValidation {
  classification: Attack3000Reality;
  usableForArithmetic: boolean;
}

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

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function validMoney(amountCents: number | null, allowZero: boolean): boolean {
  if (amountCents === null || !Number.isSafeInteger(amountCents)) return false;
  return allowZero ? amountCents >= 0 : amountCents > 0;
}

function normalizeCurrency(currency: string | undefined): string | null {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function parseTimestamp(value: string | undefined): number | null {
  if (!nonEmpty(value)) return null;
  const parsed = Date.parse(value!);
  return Number.isFinite(parsed) ? parsed : null;
}

function validScope(scope: FundraisingCapitalScope | undefined): scope is FundraisingCapitalScope {
  return Boolean(
    scope &&
      nonEmpty(scope.projectId) &&
      nonEmpty(scope.legalEntityId) &&
      nonEmpty(scope.capitalLaneId),
  );
}

function sameScope(left: FundraisingCapitalScope, right: FundraisingCapitalScope): boolean {
  return (
    left.projectId.trim() === right.projectId.trim() &&
    left.legalEntityId.trim() === right.legalEntityId.trim() &&
    left.capitalLaneId.trim() === right.capitalLaneId.trim()
  );
}

function validateTermsContext(
  context: FundraisingTermsContext | undefined,
  reasons: Set<string>,
): TermsContextValidation {
  if (!context) {
    reasons.add('terms_context:missing');
    return {
      classification: 'UNKNOWN',
      valid: false,
      asOfMs: null,
      maxEvidenceAgeMs: null,
      expectedScope: null,
    };
  }

  let valid = true;
  const asOfMs = parseTimestamp(context.asOf);
  if (asOfMs === null) {
    reasons.add('terms_context:invalid_as_of');
    valid = false;
  }

  const maxEvidenceAgeDays = context.maxEvidenceAgeDays;
  const validMaxAge = Number.isFinite(maxEvidenceAgeDays) && maxEvidenceAgeDays >= 0;
  if (!validMaxAge) {
    reasons.add('terms_context:invalid_max_evidence_age');
    valid = false;
  }

  if (!validScope(context.expectedScope)) {
    reasons.add('terms_context:invalid_expected_scope');
    valid = false;
  }

  return {
    classification: valid ? 'VERIFIED' : 'UNKNOWN',
    valid,
    asOfMs,
    maxEvidenceAgeMs: validMaxAge ? maxEvidenceAgeDays * 24 * 60 * 60 * 1000 : null,
    expectedScope: validScope(context.expectedScope) ? context.expectedScope : null,
  };
}

function observationReality(
  label: 'pre_money' | 'raise_amount',
  observation: FundraisingMoneyObservation,
  allowZero: boolean,
  context: TermsContextValidation,
  reasons: Set<string>,
): MoneyObservationValidation {
  let classification = observation.classification;
  let usableForArithmetic = context.valid;

  if (!validMoney(observation.amountCents, allowZero)) {
    reasons.add(`${label}:invalid_amount`);
    classification = weakestReality(classification, 'UNKNOWN');
    usableForArithmetic = false;
  }

  if (normalizeCurrency(observation.currency) === null) {
    reasons.add(`${label}:missing_or_invalid_currency`);
    classification = weakestReality(classification, 'UNKNOWN');
    usableForArithmetic = false;
  }

  const observedAtMs = parseTimestamp(observation.observedAt);
  if (observedAtMs === null) {
    reasons.add(`${label}:missing_or_invalid_observed_at`);
    classification = weakestReality(classification, 'UNKNOWN');
    usableForArithmetic = false;
  } else if (context.asOfMs !== null && context.maxEvidenceAgeMs !== null) {
    if (observedAtMs > context.asOfMs) {
      reasons.add(`${label}:future_evidence`);
      classification = weakestReality(classification, 'UNKNOWN');
      usableForArithmetic = false;
    } else if (context.asOfMs - observedAtMs > context.maxEvidenceAgeMs) {
      reasons.add(`${label}:stale_evidence`);
      classification = weakestReality(classification, 'UNKNOWN');
      usableForArithmetic = false;
    }
  }

  if (!validScope(observation.scope) || !context.expectedScope || !sameScope(observation.scope, context.expectedScope)) {
    reasons.add(`${label}:scope_mismatch`);
    classification = weakestReality(classification, 'UNKNOWN');
    usableForArithmetic = false;
  }

  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add(`${label}:verified_without_evidence`);
    classification = weakestReality(classification, 'UNKNOWN');
    usableForArithmetic = false;
  }

  if (observation.classification !== 'VERIFIED') {
    reasons.add(`${label}:${observation.classification.toLowerCase()}`);
  }

  return { classification, usableForArithmetic };
}

/**
 * Derives only arithmetic from the supplied financing terms. Attack 1000 adds
 * currency, freshness, and legal-entity/capital-lane identity as prerequisites
 * so cross-lane or stale observations cannot become apparently valid dilution.
 */
export function deriveFundraisingTerms(input: FundraisingTermsInput): FundraisingTermsDerivation {
  const reasons = new Set<string>();
  const context = validateTermsContext(input.context, reasons);
  const preMoneyValidation = observationReality(
    'pre_money',
    input.preMoneyValuation,
    true,
    context,
    reasons,
  );
  const raiseValidation = observationReality(
    'raise_amount',
    input.raiseAmount,
    false,
    context,
    reasons,
  );
  let classification = weakestReality(
    context.classification,
    preMoneyValidation.classification,
    raiseValidation.classification,
  );
  const evidenceRefs = cleanRefs([
    ...input.preMoneyValuation.evidenceRefs,
    ...input.raiseAmount.evidenceRefs,
  ]);

  const preMoneyCurrency = normalizeCurrency(input.preMoneyValuation.currency);
  const raiseCurrency = normalizeCurrency(input.raiseAmount.currency);
  const currency = preMoneyCurrency && raiseCurrency && preMoneyCurrency === raiseCurrency
    ? preMoneyCurrency
    : null;

  if (preMoneyCurrency && raiseCurrency && preMoneyCurrency !== raiseCurrency) {
    reasons.add('terms:currency_mismatch');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  const preMoney = input.preMoneyValuation.amountCents;
  const raiseAmount = input.raiseAmount.amountCents;
  const arithmeticUsable =
    preMoneyValidation.usableForArithmetic &&
    raiseValidation.usableForArithmetic &&
    currency !== null;

  if (!arithmeticUsable || !validMoney(preMoney, true) || !validMoney(raiseAmount, false)) {
    return {
      classification,
      currency,
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
      currency,
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
    currency,
    postMoneyValuationCents,
    impliedDilutionPct,
    retainedOwnershipPct,
    evidenceRefs,
    reasons: [...reasons],
  };
}

function bindTermsToSubject(
  terms: FundraisingTermsDerivation,
  context: FundraisingTermsContext | undefined,
  subjectProjectId: string | undefined,
): FundraisingTermsDerivation {
  if (
    context &&
    validScope(context.expectedScope) &&
    nonEmpty(subjectProjectId) &&
    context.expectedScope.projectId.trim() === subjectProjectId!.trim()
  ) {
    return terms;
  }

  return {
    ...terms,
    classification: weakestReality(terms.classification, 'UNKNOWN'),
    postMoneyValuationCents: null,
    impliedDilutionPct: null,
    retainedOwnershipPct: null,
    reasons: [...new Set([...terms.reasons, 'subject:project_scope_mismatch'])],
  };
}

function deriveTermBurden(
  observation: FundraisingTermBurdenObservation | undefined,
  expectedScope: FundraisingCapitalScope | undefined,
): FundraisingTermBurdenDerivation {
  if (!observation) {
    return {
      classification: 'UNKNOWN',
      completeness: 'UNKNOWN',
      instrument: null,
      evidenceRefs: [],
      reasons: ['term_burden:missing'],
    };
  }

  const reasons = new Set<string>();
  let classification = observation.classification;
  const instrument = observation.instrument?.trim() || null;

  if (!instrument) {
    reasons.add('term_burden:missing_instrument');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (!observation.economicRightsKnown) {
    reasons.add('term_burden:economic_rights_unknown');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (!observation.controlRightsKnown) {
    reasons.add('term_burden:control_rights_unknown');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (
    !validScope(observation.scope) ||
    !expectedScope ||
    !validScope(expectedScope) ||
    !sameScope(observation.scope, expectedScope)
  ) {
    reasons.add('term_burden:scope_mismatch');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add('term_burden:verified_without_evidence');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification !== 'VERIFIED') {
    reasons.add(`term_burden:${observation.classification.toLowerCase()}`);
  }

  const completeness: FundraisingTermBurdenCompleteness =
    classification === 'BLOCKED'
      ? 'BLOCKED'
      : classification === 'VERIFIED' &&
          instrument !== null &&
          observation.economicRightsKnown &&
          observation.controlRightsKnown
        ? 'COMPLETE'
        : 'INCOMPLETE';

  return {
    classification,
    completeness,
    instrument,
    evidenceRefs: cleanRefs(observation.evidenceRefs),
    reasons: [...reasons],
  };
}

function normalizeOptions(options: readonly string[]): string[] {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
}

export function deriveFundraisingOptionality(
  observation: FundraisingOptionSetObservation | undefined,
  expectedScope?: FundraisingCapitalScope,
): FundraisingOptionalityDerivation {
  if (!observation) {
    return {
      classification: 'UNKNOWN',
      state: 'UNKNOWN',
      preservedOptions: [],
      weakenedOptions: [],
      addedOptions: [],
      evidenceRefs: [],
      reasons: ['optionality:missing'],
    };
  }

  const reasons = new Set<string>();
  let classification = observation.classification;
  const before = normalizeOptions(observation.before);
  const after = normalizeOptions(observation.after);

  if (before.length === 0) {
    reasons.add('optionality:missing_before_set');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (after.length === 0) {
    reasons.add('optionality:missing_after_set');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (
    !validScope(observation.scope) ||
    !expectedScope ||
    !validScope(expectedScope) ||
    !sameScope(observation.scope, expectedScope)
  ) {
    reasons.add('optionality:scope_mismatch');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add('optionality:verified_without_evidence');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification !== 'VERIFIED') {
    reasons.add(`optionality:${observation.classification.toLowerCase()}`);
  }

  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const preservedOptions = before.filter((option) => afterSet.has(option));
  const weakenedOptions = before.filter((option) => !afterSet.has(option));
  const addedOptions = after.filter((option) => !beforeSet.has(option));

  let state: FundraisingOptionalityState;
  if (classification === 'BLOCKED') {
    state = 'BLOCKED';
  } else if (before.length === 0 || after.length === 0) {
    state = 'UNKNOWN';
  } else if (weakenedOptions.length > 0 && addedOptions.length > 0) {
    state = 'MIXED';
  } else if (weakenedOptions.length > 0) {
    state = 'CONSTRAINED';
  } else if (addedOptions.length > 0) {
    state = 'EXPANDED';
  } else {
    state = 'PRESERVED';
  }

  return {
    classification,
    state,
    preservedOptions,
    weakenedOptions,
    addedOptions,
    evidenceRefs: cleanRefs(observation.evidenceRefs),
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
  termBurden: FundraisingTermBurdenDerivation,
): Attack3000Evidence {
  const termSummary =
    terms.postMoneyValuationCents !== null && terms.impliedDilutionPct !== null
      ? `currency=${terms.currency}; postMoneyCents=${terms.postMoneyValuationCents}; impliedDilutionPct=${terms.impliedDilutionPct}`
      : 'financing terms could not be fully derived';
  const burdenSummary = `instrument=${termBurden.instrument ?? 'unknown'}; termCompleteness=${termBurden.completeness}`;

  return {
    ...evidence,
    classification: weakestReality(
      evidence.classification,
      terms.classification,
      termBurden.classification,
    ),
    evidenceRefs: cleanRefs([
      ...evidence.evidenceRefs,
      ...terms.evidenceRefs,
      ...termBurden.evidenceRefs,
    ]),
    note: [
      evidence.note?.trim(),
      `${termSummary}; termClassification=${terms.classification}`,
      burdenSummary,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

function opportunityCostEvidence(
  evidence: Attack3000Evidence,
  optionality: FundraisingOptionalityDerivation,
): Attack3000Evidence {
  const optionalitySummary = [
    `optionalityState=${optionality.state}`,
    `preserved=${optionality.preservedOptions.join(',') || 'none'}`,
    `weakened=${optionality.weakenedOptions.join(',') || 'none'}`,
    `added=${optionality.addedOptions.join(',') || 'none'}`,
  ].join('; ');

  return {
    ...evidence,
    classification: weakestReality(evidence.classification, optionality.classification),
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...optionality.evidenceRefs]),
    note: [evidence.note?.trim(), optionalitySummary].filter(Boolean).join(' | '),
  };
}

export function createFundraisingAttack3000Assessment(
  input: FundraisingAttack3000Input,
): {
  terms: FundraisingTermsDerivation;
  termBurden: FundraisingTermBurdenDerivation;
  optionality: FundraisingOptionalityDerivation;
  assessment: Attack3000Assessment;
} {
  const derivedTerms = deriveFundraisingTerms(input.terms);
  const terms = bindTermsToSubject(
    derivedTerms,
    input.terms.context,
    input.subject.projectId,
  );
  const expectedScope = input.terms.context?.expectedScope;
  const termBurden = deriveTermBurden(input.termBurden, expectedScope);
  const optionality = deriveFundraisingOptionality(input.optionality, expectedScope);
  const stopCondition =
    input.stopCondition.kind === 'explicit'
      ? input.stopCondition.trigger
      : buildDilutionStopCondition(terms, input.stopCondition.ceiling);

  return {
    terms,
    termBurden,
    optionality,
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
        economics: economicsEvidence(input.evidence.economics, terms, termBurden),
        opportunity_cost: opportunityCostEvidence(input.evidence.opportunityCost, optionality),
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
  const { terms, termBurden, optionality, assessment } = createFundraisingAttack3000Assessment(input);
  return {
    terms,
    termBurden,
    optionality,
    assessment,
    evaluation: evaluateAttack3000(assessment),
  };
}
