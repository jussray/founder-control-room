import type {
  ActionRisk,
  GovernedActionVerdict,
  GovernedDecision,
  GovernanceReasonCode,
  IntentSource,
  RecoveryLevel,
} from './governedIntelligence.js';

export type GovernanceBlockCategory = Exclude<GovernanceReasonCode, 'allow'>;

export interface GovernanceObservation {
  projectId: string;
  decision: GovernedDecision;
  risk: ActionRisk;
  intentSource: IntentSource | 'none';
  memoryCount: number;
  proofCount: number;
  recoveryLevel: RecoveryLevel | 'none';
  blockCategories: GovernanceBlockCategory[];
}

export interface GovernanceAnalyticsSummary {
  total: number;
  allowRate: number;
  reconfirmRate: number;
  denyRate: number;
  averageMemoryEvidence: number;
  averageProofEvidence: number;
  blockCategoryCounts: Record<GovernanceBlockCategory, number>;
}

const BLOCK_CATEGORIES: GovernanceBlockCategory[] = [
  'hard_constraint',
  'intent_missing',
  'intent_conflict',
  'intent_advisory_only',
  'memory_missing',
  'memory_stale_or_invalid',
  'memory_authority',
  'proof_missing_or_invalid',
  'recovery_insufficient',
  'execution_authorization_missing',
  'execution_authorization_binding',
  'execution_authorization_replay',
  'execution_authorization_stale_or_revoked',
  'irreversible_action',
];

function boundedCount(value: number): number {
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 10_000) : 0;
}

export function governanceObservationFromVerdict(input: {
  projectId: string;
  risk: ActionRisk;
  verdict: GovernedActionVerdict;
  recoveryLevel?: RecoveryLevel | null;
}): GovernanceObservation {
  const categories = [...new Set(input.verdict.reasonCodes.filter((code): code is GovernanceBlockCategory => code !== 'allow'))];

  return {
    projectId: input.projectId.trim().slice(0, 160) || 'unknown',
    decision: input.verdict.decision,
    risk: input.risk,
    intentSource: input.verdict.selectedIntent?.source ?? 'none',
    memoryCount: boundedCount(input.verdict.lineage.memoryIds.length),
    proofCount: boundedCount(input.verdict.lineage.proofIds.length),
    recoveryLevel: input.recoveryLevel ?? 'none',
    blockCategories: categories,
  };
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : Number((count / total).toFixed(4));
}

export function summarizeGovernanceObservations(
  observations: readonly GovernanceObservation[],
): GovernanceAnalyticsSummary {
  const total = observations.length;
  const counts = Object.fromEntries(BLOCK_CATEGORIES.map((category) => [category, 0])) as Record<GovernanceBlockCategory, number>;
  let allow = 0;
  let reconfirm = 0;
  let deny = 0;
  let memoryEvidence = 0;
  let proofEvidence = 0;

  for (const observation of observations) {
    if (observation.decision === 'allow') allow += 1;
    else if (observation.decision === 'reconfirm') reconfirm += 1;
    else deny += 1;
    memoryEvidence += boundedCount(observation.memoryCount);
    proofEvidence += boundedCount(observation.proofCount);
    for (const category of new Set(observation.blockCategories)) counts[category] += 1;
  }

  return {
    total,
    allowRate: rate(allow, total),
    reconfirmRate: rate(reconfirm, total),
    denyRate: rate(deny, total),
    averageMemoryEvidence: total === 0 ? 0 : Number((memoryEvidence / total).toFixed(2)),
    averageProofEvidence: total === 0 ? 0 : Number((proofEvidence / total).toFixed(2)),
    blockCategoryCounts: counts,
  };
}
