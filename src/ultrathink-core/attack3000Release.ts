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

export const ATTACK_3000_RELEASE_ADAPTER_ID = 'release-truth-chain@v1' as const;

export const RELEASE_STAGE_ORDER = [
  'source',
  'artifact',
  'provider_acceptance',
  'runtime_identity',
  'user_path',
  'external_outcome',
] as const;

export type ReleaseStage = (typeof RELEASE_STAGE_ORDER)[number];

export interface ReleaseStageObservation {
  satisfied: boolean;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ReleaseTermsInput {
  source: ReleaseStageObservation;
  artifact: ReleaseStageObservation;
  providerAcceptance: ReleaseStageObservation;
  runtimeIdentity: ReleaseStageObservation;
  userPath: ReleaseStageObservation;
  externalOutcome: ReleaseStageObservation;
}

export interface ReleaseTermsDerivation {
  classification: Attack3000Reality;
  releaseReady: boolean;
  contiguousStage: ReleaseStage | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface ReleaseAttack3000Evidence {
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

export interface ReleaseStageRequirement {
  stage: ReleaseStage;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type ReleaseStopCondition =
  | { kind: 'explicit'; trigger: Attack3000Trigger }
  | { kind: 'stage_required'; requirement: ReleaseStageRequirement };

export interface ReleaseAttack3000Input {
  subject: Omit<Attack3000Subject, 'domain'>;
  terms: ReleaseTermsInput;
  evidence: ReleaseAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: ReleaseStopCondition;
}

export interface ReleaseAttack3000Result {
  terms: ReleaseTermsDerivation;
  assessment: Attack3000Assessment;
  evaluation: Attack3000Evaluation;
}

const REALITY_RANK: Readonly<Record<Attack3000Reality, number>> = {
  VERIFIED: 0,
  INFERRED: 1,
  UNKNOWN: 2,
  BLOCKED: 3,
};

const INPUT_BY_STAGE: Readonly<Record<ReleaseStage, keyof ReleaseTermsInput>> = {
  source: 'source',
  artifact: 'artifact',
  provider_acceptance: 'providerAcceptance',
  runtime_identity: 'runtimeIdentity',
  user_path: 'userPath',
  external_outcome: 'externalOutcome',
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

function inspectStage(
  stage: ReleaseStage,
  observation: ReleaseStageObservation,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = observation.classification;

  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add(`${stage}:verified_without_evidence`);
    classification = weakestReality(classification, 'UNKNOWN');
  }

  if (observation.classification !== 'VERIFIED') {
    reasons.add(`${stage}:${observation.classification.toLowerCase()}`);
  }

  if (!observation.satisfied) reasons.add(`${stage}:not_satisfied`);
  return classification;
}

/**
 * Release proof is an ordered chain, not a bag of green checks. Later-stage
 * evidence cannot donate truth to an earlier missing stage.
 */
export function deriveReleaseTerms(input: ReleaseTermsInput): ReleaseTermsDerivation {
  const reasons = new Set<string>();
  const realities: Attack3000Reality[] = [];
  const refs: string[] = [];
  let contiguousStage: ReleaseStage | null = null;
  let chainOpen = true;
  let structurallyValid = true;

  for (const stage of RELEASE_STAGE_ORDER) {
    const observation = input[INPUT_BY_STAGE[stage]];
    realities.push(inspectStage(stage, observation, reasons));
    refs.push(...observation.evidenceRefs);

    if (chainOpen && observation.satisfied) {
      contiguousStage = stage;
      continue;
    }

    if (!observation.satisfied) {
      chainOpen = false;
      continue;
    }

    reasons.add(`chain:${stage}_without_predecessor`);
    structurallyValid = false;
  }

  let classification = weakestReality(...realities);
  if (!structurallyValid) classification = weakestReality(classification, 'UNKNOWN');

  return {
    classification,
    releaseReady:
      structurallyValid &&
      classification === 'VERIFIED' &&
      RELEASE_STAGE_ORDER.every((stage) => input[INPUT_BY_STAGE[stage]].satisfied),
    contiguousStage,
    evidenceRefs: cleanRefs(refs),
    reasons: [...reasons],
  };
}

function requirementReality(requirement: ReleaseStageRequirement): Attack3000Reality {
  if (requirement.classification === 'VERIFIED' && !hasEvidence(requirement.evidenceRefs)) {
    return 'UNKNOWN';
  }
  return requirement.classification;
}

function buildStageRequiredStopCondition(
  input: ReleaseTermsInput,
  terms: ReleaseTermsDerivation,
  requirement: ReleaseStageRequirement,
): Attack3000Trigger {
  const observation = input[INPUT_BY_STAGE[requirement.stage]];
  return {
    statement: `Stop release if required stage ${requirement.stage} is not satisfied.`,
    classification: weakestReality(
      terms.classification,
      observation.classification,
      requirementReality(requirement),
    ),
    triggered: !observation.satisfied,
    evidenceRefs: cleanRefs([
      ...terms.evidenceRefs,
      ...observation.evidenceRefs,
      ...requirement.evidenceRefs,
    ]),
  };
}

function releaseChainEvidence(
  evidence: Attack3000Evidence,
  terms: ReleaseTermsDerivation,
): Attack3000Evidence {
  return {
    ...evidence,
    classification: weakestReality(evidence.classification, terms.classification),
    direction: terms.releaseReady ? evidence.direction : 'NEUTRAL',
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...terms.evidenceRefs]),
    note: [
      evidence.note?.trim(),
      `releaseReady=${terms.releaseReady}; contiguousStage=${terms.contiguousStage ?? 'none'}; termClassification=${terms.classification}`,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

export function createReleaseAttack3000Assessment(
  input: ReleaseAttack3000Input,
): { terms: ReleaseTermsDerivation; assessment: Attack3000Assessment } {
  const terms = deriveReleaseTerms(input.terms);
  const stopCondition =
    input.stopCondition.kind === 'explicit'
      ? input.stopCondition.trigger
      : buildStageRequiredStopCondition(input.terms, terms, input.stopCondition.requirement);

  return {
    terms,
    assessment: {
      schema: ATTACK_3000_SCHEMA,
      subject: { ...input.subject, domain: 'release' },
      adapterId: ATTACK_3000_RELEASE_ADAPTER_ID,
      dimensions: {
        value_created: input.evidence.valueCreated,
        human_outcome: input.evidence.humanOutcome,
        external_demand: input.evidence.externalDemand,
        economics: input.evidence.economics,
        opportunity_cost: input.evidence.opportunityCost,
        dependencies: releaseChainEvidence(input.evidence.dependencies, terms),
        reversibility: input.evidence.reversibility,
        second_order_effects: input.evidence.secondOrderEffects,
        third_order_effects: input.evidence.thirdOrderEffects,
      },
      falsifier: input.falsifier,
      stopCondition,
    },
  };
}

export function evaluateReleaseAttack3000(
  input: ReleaseAttack3000Input,
): ReleaseAttack3000Result {
  const { terms, assessment } = createReleaseAttack3000Assessment(input);
  return { terms, assessment, evaluation: evaluateAttack3000(assessment) };
}
