import {
  ATTACK_3000_SCHEMA,
  evaluateAttack3000,
  type Attack3000Assessment,
  type Attack3000Direction,
  type Attack3000Evaluation,
  type Attack3000Evidence,
  type Attack3000Reality,
  type Attack3000Subject,
  type Attack3000Trigger,
} from './attack3000.js';

export const ATTACK_3000_VENDOR_ADAPTER_ID = 'vendor-partnership@v1' as const;

export interface VendorNumberObservation {
  value: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface VendorCountObservation {
  count: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface VendorBooleanObservation {
  value: boolean | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface VendorPartnershipTermsInput {
  agreedCostUsd: VendorNumberObservation;
  actualCostUsd: VendorNumberObservation;
  milestonesDue: VendorCountObservation;
  milestonesAccepted: VendorCountObservation;
  monthlyOperationalHours: VendorNumberObservation;
  exitLeadTimeDays: VendorNumberObservation;
  artifactsPortable: VendorBooleanObservation;
  dataExportable: VendorBooleanObservation;
  replacementPath: VendorBooleanObservation;
  realizedOutcome: VendorBooleanObservation;
}

export interface VendorPartnershipTermsDerivation {
  deliveryClassification: Attack3000Reality;
  economicsClassification: Attack3000Reality;
  operationalClassification: Attack3000Reality;
  exitClassification: Attack3000Reality;
  outcomeClassification: Attack3000Reality;
  milestoneAcceptanceRatePct: number | null;
  costVariancePct: number | null;
  monthlyOperationalHours: number | null;
  exitLeadTimeDays: number | null;
  exitReady: boolean | null;
  realizedOutcome: boolean | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface VendorAttack3000Evidence {
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

export interface VendorBoundary {
  value: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface VendorBooleanRequirement {
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type VendorStopCondition =
  | { kind: 'explicit'; trigger: Attack3000Trigger }
  | { kind: 'milestone_acceptance_floor'; floor: VendorBoundary }
  | { kind: 'max_cost_overrun_pct'; ceiling: VendorBoundary }
  | { kind: 'max_operational_hours'; ceiling: VendorBoundary }
  | { kind: 'max_exit_lead_time_days'; ceiling: VendorBoundary }
  | { kind: 'require_exit_ready'; requirement: VendorBooleanRequirement }
  | { kind: 'require_realized_outcome'; requirement: VendorBooleanRequirement };

export interface VendorAttack3000Input {
  subject: Omit<Attack3000Subject, 'domain'>;
  terms: VendorPartnershipTermsInput;
  evidence: VendorAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: VendorStopCondition;
}

export interface VendorAttack3000Result {
  terms: VendorPartnershipTermsDerivation;
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

function validNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function validCount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function observationReality(
  label: string,
  valueIsValid: boolean,
  classification: Attack3000Reality,
  evidenceRefs: readonly string[],
  reasons: Set<string>,
): Attack3000Reality {
  let result = classification;
  if (!valueIsValid) {
    reasons.add(`${label}:invalid_value`);
    result = weakestReality(result, 'UNKNOWN');
  }
  if (classification === 'VERIFIED' && !hasEvidence(evidenceRefs)) {
    reasons.add(`${label}:verified_without_evidence`);
    result = weakestReality(result, 'UNKNOWN');
  }
  if (classification !== 'VERIFIED') {
    reasons.add(`${label}:${classification.toLowerCase()}`);
  }
  return result;
}

function booleanObservationReality(
  label: string,
  observation: VendorBooleanObservation,
  reasons: Set<string>,
): Attack3000Reality {
  return observationReality(
    label,
    typeof observation.value === 'boolean',
    observation.classification,
    observation.evidenceRefs,
    reasons,
  );
}

export function deriveVendorPartnershipTerms(
  input: VendorPartnershipTermsInput,
): VendorPartnershipTermsDerivation {
  const reasons = new Set<string>();

  const agreedCostReality = observationReality(
    'agreed_cost_usd',
    validNumber(input.agreedCostUsd.value),
    input.agreedCostUsd.classification,
    input.agreedCostUsd.evidenceRefs,
    reasons,
  );
  const actualCostReality = observationReality(
    'actual_cost_usd',
    validNumber(input.actualCostUsd.value),
    input.actualCostUsd.classification,
    input.actualCostUsd.evidenceRefs,
    reasons,
  );
  let economicsClassification = weakestReality(agreedCostReality, actualCostReality);

  const milestonesDueReality = observationReality(
    'milestones_due',
    validCount(input.milestonesDue.count),
    input.milestonesDue.classification,
    input.milestonesDue.evidenceRefs,
    reasons,
  );
  const milestonesAcceptedReality = observationReality(
    'milestones_accepted',
    validCount(input.milestonesAccepted.count),
    input.milestonesAccepted.classification,
    input.milestonesAccepted.evidenceRefs,
    reasons,
  );
  let deliveryClassification = weakestReality(
    milestonesDueReality,
    milestonesAcceptedReality,
  );

  const operationalClassification = observationReality(
    'monthly_operational_hours',
    validNumber(input.monthlyOperationalHours.value),
    input.monthlyOperationalHours.classification,
    input.monthlyOperationalHours.evidenceRefs,
    reasons,
  );

  const exitLeadReality = observationReality(
    'exit_lead_time_days',
    validNumber(input.exitLeadTimeDays.value),
    input.exitLeadTimeDays.classification,
    input.exitLeadTimeDays.evidenceRefs,
    reasons,
  );
  const artifactsPortableReality = booleanObservationReality(
    'artifacts_portable',
    input.artifactsPortable,
    reasons,
  );
  const dataExportableReality = booleanObservationReality(
    'data_exportable',
    input.dataExportable,
    reasons,
  );
  const replacementPathReality = booleanObservationReality(
    'replacement_path',
    input.replacementPath,
    reasons,
  );
  const exitClassification = weakestReality(
    exitLeadReality,
    artifactsPortableReality,
    dataExportableReality,
    replacementPathReality,
  );

  const outcomeClassification = booleanObservationReality(
    'realized_outcome',
    input.realizedOutcome,
    reasons,
  );

  const evidenceRefs = cleanRefs([
    ...input.agreedCostUsd.evidenceRefs,
    ...input.actualCostUsd.evidenceRefs,
    ...input.milestonesDue.evidenceRefs,
    ...input.milestonesAccepted.evidenceRefs,
    ...input.monthlyOperationalHours.evidenceRefs,
    ...input.exitLeadTimeDays.evidenceRefs,
    ...input.artifactsPortable.evidenceRefs,
    ...input.dataExportable.evidenceRefs,
    ...input.replacementPath.evidenceRefs,
    ...input.realizedOutcome.evidenceRefs,
  ]);

  let milestoneAcceptanceRatePct: number | null = null;
  if (validCount(input.milestonesDue.count) && validCount(input.milestonesAccepted.count)) {
    if (input.milestonesAccepted.count! > input.milestonesDue.count!) {
      reasons.add('milestones:accepted_exceeds_due');
      deliveryClassification = weakestReality(deliveryClassification, 'UNKNOWN');
    } else if (input.milestonesDue.count === 0) {
      reasons.add('milestone_acceptance:zero_due_denominator');
      deliveryClassification = weakestReality(deliveryClassification, 'UNKNOWN');
    } else {
      milestoneAcceptanceRatePct =
        (input.milestonesAccepted.count! / input.milestonesDue.count!) * 100;
    }
  }

  let costVariancePct: number | null = null;
  if (validNumber(input.agreedCostUsd.value) && validNumber(input.actualCostUsd.value)) {
    if (input.agreedCostUsd.value === 0) {
      if (input.actualCostUsd.value === 0) {
        costVariancePct = 0;
      } else {
        reasons.add('cost_variance:zero_agreed_denominator');
        economicsClassification = weakestReality(economicsClassification, 'UNKNOWN');
      }
    } else {
      costVariancePct =
        ((input.actualCostUsd.value! - input.agreedCostUsd.value) /
          input.agreedCostUsd.value) *
        100;
    }
  }

  const exitReady =
    exitClassification === 'UNKNOWN' || exitClassification === 'BLOCKED'
      ? null
      : typeof input.artifactsPortable.value === 'boolean' &&
          typeof input.dataExportable.value === 'boolean' &&
          typeof input.replacementPath.value === 'boolean'
        ? input.artifactsPortable.value &&
          input.dataExportable.value &&
          input.replacementPath.value
        : null;

  return {
    deliveryClassification,
    economicsClassification,
    operationalClassification,
    exitClassification,
    outcomeClassification,
    milestoneAcceptanceRatePct,
    costVariancePct,
    monthlyOperationalHours: validNumber(input.monthlyOperationalHours.value)
      ? input.monthlyOperationalHours.value
      : null,
    exitLeadTimeDays: validNumber(input.exitLeadTimeDays.value)
      ? input.exitLeadTimeDays.value
      : null,
    exitReady,
    realizedOutcome:
      typeof input.realizedOutcome.value === 'boolean' ? input.realizedOutcome.value : null,
    evidenceRefs,
    reasons: [...reasons],
  };
}

function normalizeBoundary(boundary: VendorBoundary): Attack3000Reality {
  let classification = boundary.classification;
  if (!Number.isFinite(boundary.value) || boundary.value < 0) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (boundary.classification === 'VERIFIED' && !hasEvidence(boundary.evidenceRefs)) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

function normalizeRequirement(requirement: VendorBooleanRequirement): Attack3000Reality {
  if (requirement.classification === 'VERIFIED' && !hasEvidence(requirement.evidenceRefs)) {
    return 'UNKNOWN';
  }
  return requirement.classification;
}

function numericStopCondition(
  statement: string,
  metric: number | null,
  metricClassification: Attack3000Reality,
  boundary: VendorBoundary,
  comparator: (metric: number, boundary: number) => boolean,
  evidenceRefs: readonly string[],
): Attack3000Trigger {
  const validBoundary = Number.isFinite(boundary.value) && boundary.value >= 0;
  return {
    statement,
    classification: weakestReality(metricClassification, normalizeBoundary(boundary)),
    triggered: validBoundary && metric !== null && comparator(metric, boundary.value),
    evidenceRefs: cleanRefs([...evidenceRefs, ...boundary.evidenceRefs]),
  };
}

function booleanStopCondition(
  statement: string,
  value: boolean | null,
  valueClassification: Attack3000Reality,
  requirement: VendorBooleanRequirement,
  evidenceRefs: readonly string[],
): Attack3000Trigger {
  return {
    statement,
    classification: weakestReality(valueClassification, normalizeRequirement(requirement)),
    triggered: value === false,
    evidenceRefs: cleanRefs([...evidenceRefs, ...requirement.evidenceRefs]),
  };
}

function enrichEvidence(
  evidence: Attack3000Evidence,
  classifications: readonly Attack3000Reality[],
  evidenceRefs: readonly string[],
  note: string,
  derivedDirection?: Attack3000Direction,
): Attack3000Evidence {
  return {
    ...evidence,
    classification: weakestReality(evidence.classification, ...classifications),
    direction: derivedDirection ?? evidence.direction,
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...evidenceRefs]),
    note: [evidence.note?.trim(), note].filter(Boolean).join(' | '),
  };
}

export function createVendorAttack3000Assessment(
  input: VendorAttack3000Input,
): { terms: VendorPartnershipTermsDerivation; assessment: Attack3000Assessment } {
  const terms = deriveVendorPartnershipTerms(input.terms);
  let stopCondition: Attack3000Trigger;

  if (input.stopCondition.kind === 'explicit') {
    stopCondition = input.stopCondition.trigger;
  } else if (input.stopCondition.kind === 'milestone_acceptance_floor') {
    stopCondition = numericStopCondition(
      `Stop if milestone acceptance falls below ${input.stopCondition.floor.value}%.`,
      terms.milestoneAcceptanceRatePct,
      terms.deliveryClassification,
      input.stopCondition.floor,
      (metric, floor) => metric < floor,
      terms.evidenceRefs,
    );
  } else if (input.stopCondition.kind === 'max_cost_overrun_pct') {
    stopCondition = numericStopCondition(
      `Stop if cost overrun exceeds ${input.stopCondition.ceiling.value}%.`,
      terms.costVariancePct,
      terms.economicsClassification,
      input.stopCondition.ceiling,
      (metric, ceiling) => metric > ceiling,
      terms.evidenceRefs,
    );
  } else if (input.stopCondition.kind === 'max_operational_hours') {
    stopCondition = numericStopCondition(
      `Stop if monthly operational burden exceeds ${input.stopCondition.ceiling.value} hours.`,
      terms.monthlyOperationalHours,
      terms.operationalClassification,
      input.stopCondition.ceiling,
      (metric, ceiling) => metric > ceiling,
      terms.evidenceRefs,
    );
  } else if (input.stopCondition.kind === 'max_exit_lead_time_days') {
    stopCondition = numericStopCondition(
      `Stop if exit lead time exceeds ${input.stopCondition.ceiling.value} days.`,
      terms.exitLeadTimeDays,
      terms.exitClassification,
      input.stopCondition.ceiling,
      (metric, ceiling) => metric > ceiling,
      terms.evidenceRefs,
    );
  } else if (input.stopCondition.kind === 'require_exit_ready') {
    stopCondition = booleanStopCondition(
      'Stop if the partnership is not exit-ready.',
      terms.exitReady,
      terms.exitClassification,
      input.stopCondition.requirement,
      terms.evidenceRefs,
    );
  } else {
    stopCondition = booleanStopCondition(
      'Stop if the partnership has not produced the required realized outcome.',
      terms.realizedOutcome,
      terms.outcomeClassification,
      input.stopCondition.requirement,
      terms.evidenceRefs,
    );
  }

  const outcomeDirection =
    terms.outcomeClassification === 'VERIFIED' && terms.realizedOutcome === false
      ? 'CONTRADICTS'
      : undefined;
  const exitDirection =
    terms.exitClassification === 'VERIFIED' && terms.exitReady === false
      ? 'CONTRADICTS'
      : undefined;

  const valueEvidence = enrichEvidence(
    input.evidence.valueCreated,
    [terms.deliveryClassification, terms.outcomeClassification],
    terms.evidenceRefs,
    `milestoneAcceptanceRatePct=${terms.milestoneAcceptanceRatePct}; realizedOutcome=${terms.realizedOutcome}`,
    outcomeDirection,
  );
  const humanOutcomeEvidence = enrichEvidence(
    input.evidence.humanOutcome,
    [terms.outcomeClassification],
    input.terms.realizedOutcome.evidenceRefs,
    `realizedOutcome=${terms.realizedOutcome}`,
    outcomeDirection,
  );
  const economicsEvidence = enrichEvidence(
    input.evidence.economics,
    [terms.economicsClassification],
    [...input.terms.agreedCostUsd.evidenceRefs, ...input.terms.actualCostUsd.evidenceRefs],
    `costVariancePct=${terms.costVariancePct}`,
  );
  const dependenciesEvidence = enrichEvidence(
    input.evidence.dependencies,
    [terms.exitClassification],
    [
      ...input.terms.artifactsPortable.evidenceRefs,
      ...input.terms.dataExportable.evidenceRefs,
      ...input.terms.replacementPath.evidenceRefs,
    ],
    `exitReady=${terms.exitReady}`,
    exitDirection,
  );
  const reversibilityEvidence = enrichEvidence(
    input.evidence.reversibility,
    [terms.exitClassification],
    [
      ...input.terms.exitLeadTimeDays.evidenceRefs,
      ...input.terms.artifactsPortable.evidenceRefs,
      ...input.terms.dataExportable.evidenceRefs,
      ...input.terms.replacementPath.evidenceRefs,
    ],
    `exitLeadTimeDays=${terms.exitLeadTimeDays}; exitReady=${terms.exitReady}`,
    exitDirection,
  );
  const secondOrderEvidence = enrichEvidence(
    input.evidence.secondOrderEffects,
    [terms.operationalClassification],
    input.terms.monthlyOperationalHours.evidenceRefs,
    `monthlyOperationalHours=${terms.monthlyOperationalHours}`,
  );
  const thirdOrderEvidence = enrichEvidence(
    input.evidence.thirdOrderEffects,
    [terms.exitClassification, terms.operationalClassification],
    terms.evidenceRefs,
    `exitReady=${terms.exitReady}; monthlyOperationalHours=${terms.monthlyOperationalHours}`,
    exitDirection,
  );

  return {
    terms,
    assessment: {
      schema: ATTACK_3000_SCHEMA,
      subject: { ...input.subject, domain: 'vendor-partnership' },
      adapterId: ATTACK_3000_VENDOR_ADAPTER_ID,
      dimensions: {
        value_created: valueEvidence,
        human_outcome: humanOutcomeEvidence,
        external_demand: input.evidence.externalDemand,
        economics: economicsEvidence,
        opportunity_cost: input.evidence.opportunityCost,
        dependencies: dependenciesEvidence,
        reversibility: reversibilityEvidence,
        second_order_effects: secondOrderEvidence,
        third_order_effects: thirdOrderEvidence,
      },
      falsifier: input.falsifier,
      stopCondition,
    },
  };
}

export function evaluateVendorAttack3000(
  input: VendorAttack3000Input,
): VendorAttack3000Result {
  const { terms, assessment } = createVendorAttack3000Assessment(input);
  return {
    terms,
    assessment,
    evaluation: evaluateAttack3000(assessment),
  };
}
