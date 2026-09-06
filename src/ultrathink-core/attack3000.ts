export const ATTACK_3000_SCHEMA = 'fcr/attack-3000@v1' as const;

export const ATTACK_3000_REQUIRED_DIMENSIONS = [
  'value_created',
  'human_outcome',
  'external_demand',
  'economics',
  'opportunity_cost',
  'dependencies',
  'reversibility',
  'second_order_effects',
  'third_order_effects',
] as const;

export type Attack3000Dimension = (typeof ATTACK_3000_REQUIRED_DIMENSIONS)[number];
export type Attack3000Reality = 'VERIFIED' | 'INFERRED' | 'UNKNOWN' | 'BLOCKED';
export type Attack3000Direction = 'SUPPORTS' | 'NEUTRAL' | 'CONTRADICTS';
export type Attack3000Verdict = 'SUPPORTED' | 'HOLD' | 'FALSIFIED';

export interface Attack3000Evidence {
  classification: Attack3000Reality;
  direction: Attack3000Direction;
  evidenceRefs: readonly string[];
  note?: string;
}

export interface Attack3000Trigger {
  statement: string;
  classification: Attack3000Reality;
  triggered: boolean;
  evidenceRefs: readonly string[];
}

export interface Attack3000Subject {
  decisionId: string;
  projectId?: string;
  portfolioId?: string;
  domain: string;
}

/**
 * FCR owns this cross-project contract. Product, commerce, release, fundraising,
 * content, vendor, and other domain adapters supply the evidence; they do not
 * redefine the verdict semantics or gain authority from the result.
 */
export interface Attack3000Assessment {
  schema: typeof ATTACK_3000_SCHEMA;
  subject: Attack3000Subject;
  adapterId: string;
  dimensions: Readonly<Partial<Record<Attack3000Dimension, Attack3000Evidence>>>;
  falsifier: Attack3000Trigger;
  stopCondition: Attack3000Trigger;
}

export const ATTACK_3000_AUTHORITY_CEILING = {
  authorizesMerge: false,
  authorizesDeploy: false,
  authorizesPublish: false,
  authorizesSpend: false,
  authorizesFundraise: false,
  authorizesExternalContact: false,
} as const;

export interface Attack3000Evaluation {
  verdict: Attack3000Verdict;
  reasons: readonly string[];
  missingDimensions: readonly Attack3000Dimension[];
  authority: typeof ATTACK_3000_AUTHORITY_CEILING;
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasEvidence(refs: readonly string[]): boolean {
  return refs.some((ref) => nonEmpty(ref));
}

function inspectTrigger(
  name: 'falsifier' | 'stop_condition',
  trigger: Attack3000Trigger,
  reasons: Set<string>,
): boolean {
  if (!nonEmpty(trigger.statement)) {
    reasons.add(`${name}:missing_statement`);
    return false;
  }

  if (trigger.classification !== 'VERIFIED') {
    reasons.add(`${name}:${trigger.classification.toLowerCase()}`);
    return false;
  }

  if (!hasEvidence(trigger.evidenceRefs)) {
    reasons.add(`${name}:verified_without_evidence`);
    return false;
  }

  return trigger.triggered;
}

/**
 * Attack 3000 is third-order falsification: after a thing can be built and its
 * proof can survive, ask whether the decision still creates enough durable
 * value to justify its cost, risk, complexity, dependencies, and lost options.
 *
 * SUPPORTED is an evidence verdict only. It never authorizes execution.
 */
export function evaluateAttack3000(
  assessment: Attack3000Assessment,
): Attack3000Evaluation {
  const reasons = new Set<string>();
  const missingDimensions: Attack3000Dimension[] = [];

  if (!nonEmpty(assessment.subject.decisionId)) reasons.add('subject:missing_decision_id');
  if (!nonEmpty(assessment.subject.domain)) reasons.add('subject:missing_domain');
  if (!nonEmpty(assessment.adapterId)) reasons.add('adapter:missing_id');

  const falsifierTriggered = inspectTrigger('falsifier', assessment.falsifier, reasons);
  const stopConditionTriggered = inspectTrigger(
    'stop_condition',
    assessment.stopCondition,
    reasons,
  );

  if (falsifierTriggered || stopConditionTriggered) {
    if (falsifierTriggered) reasons.add('falsifier:triggered');
    if (stopConditionTriggered) reasons.add('stop_condition:triggered');
    return {
      verdict: 'FALSIFIED',
      reasons: [...reasons],
      missingDimensions,
      authority: ATTACK_3000_AUTHORITY_CEILING,
    };
  }

  for (const dimension of ATTACK_3000_REQUIRED_DIMENSIONS) {
    const evidence = assessment.dimensions[dimension];
    if (!evidence) {
      missingDimensions.push(dimension);
      reasons.add(`dimension:${dimension}:missing`);
      continue;
    }

    if (evidence.classification !== 'VERIFIED') {
      reasons.add(`dimension:${dimension}:${evidence.classification.toLowerCase()}`);
      continue;
    }

    if (!hasEvidence(evidence.evidenceRefs)) {
      reasons.add(`dimension:${dimension}:verified_without_evidence`);
      continue;
    }

    if (evidence.direction !== 'SUPPORTS') {
      reasons.add(`dimension:${dimension}:${evidence.direction.toLowerCase()}`);
    }
  }

  return {
    verdict: reasons.size === 0 ? 'SUPPORTED' : 'HOLD',
    reasons: [...reasons],
    missingDimensions,
    authority: ATTACK_3000_AUTHORITY_CEILING,
  };
}
