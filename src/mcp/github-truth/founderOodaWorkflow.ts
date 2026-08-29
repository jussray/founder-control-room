import type {
  ParallelFixAuditEvaluation,
  ParallelFixAuditSnapshot,
} from './types.js';
import {
  DEFAULT_PR_AUDIT_FRESHNESS_MS,
  MAX_PR_AUDIT_FRESHNESS_MS,
} from './verification.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export const FOUNDER_OODA_REASONING_PROFILE = [
  'ultrathink',
  'redteam_premise',
  'lindy',
  'l99',
  'ooda',
  'redteam_solution',
] as const;

export type FounderOodaReasoningLens = typeof FOUNDER_OODA_REASONING_PROFILE[number];

export type WorkflowLaneName = 'machine' | 'provider' | 'governance';

export type WorkflowLaneState =
  | 'complete'
  | 'incomplete'
  | 'conflicted'
  | 'blocked'
  | 'not_applicable'
  | 'candidate_only';

export type WorkflowLaneObservation = {
  lane: WorkflowLaneName;
  state: WorkflowLaneState;
  baseSha: string | null;
  headSha: string | null;
  observedAt: string | null;
};

export type SemanticReviewAttemptState =
  | 'clean'
  | 'findings'
  | 'pending'
  | 'quota_blocked'
  | 'unavailable'
  | 'request_accepted_no_output';

export type SemanticReviewAttempt = {
  reviewerId: string;
  reviewerIdentityState: 'verified' | 'unverified';
  state: SemanticReviewAttemptState;
  headSha: string | null;
  observedAt: string | null;
  findingCount?: number | null;
};

export type FounderOodaWorkflowFinding =
  | 'workflow_parallel_truth_not_current'
  | 'workflow_current_snapshot_malformed'
  | 'workflow_current_evidence_incomplete'
  | 'workflow_current_evidence_conflicted'
  | 'workflow_current_actor_unverified'
  | 'workflow_current_observation_time_unknown'
  | 'workflow_current_observation_stale'
  | 'workflow_invalid_audit_time'
  | 'workflow_invalid_freshness_window'
  | 'workflow_parallel_mutation_detected'
  | 'workflow_lane_identity_mismatch'
  | 'workflow_lane_fingerprint_mismatch'
  | 'workflow_lane_observation_time_unknown'
  | 'workflow_lane_observation_stale'
  | 'workflow_lane_conflicted'
  | 'workflow_lane_blocked'
  | 'workflow_machine_not_complete'
  | 'workflow_provider_required_not_complete'
  | 'workflow_provider_candidate_only'
  | 'workflow_governance_required_not_complete'
  | 'workflow_review_actor_unverified'
  | 'workflow_review_stale_for_head'
  | 'workflow_review_observation_time_unknown'
  | 'workflow_review_observation_stale'
  | 'workflow_review_findings'
  | 'workflow_review_blocked'
  | 'workflow_review_missing';

export type EvaluateFounderOodaWorkflowInput = {
  parallelAudit: ParallelFixAuditEvaluation;
  current: ParallelFixAuditSnapshot;
  machine: WorkflowLaneObservation;
  provider: WorkflowLaneObservation;
  governance: WorkflowLaneObservation;
  providerRequired: boolean;
  governanceRequired: boolean;
  reviewAttempts: readonly SemanticReviewAttempt[];
  /** Zero or one active writer is allowed. Read-only lanes may still run in parallel. */
  activeMutationLanes: readonly string[];
  auditedAt: string;
  freshnessWindowMs?: number;
};

export type FounderOodaWorkflowState =
  | 'repair'
  | 'verifying'
  | 'review_pending'
  | 'blocked'
  | 'founder_final_required';

export type FounderOodaWorkflowEvaluation = {
  state: FounderOodaWorkflowState;
  semanticReview: 'clean' | 'findings' | 'pending' | 'blocked';
  dependentProof: 'current' | 'stale';
  mutationMode: 'serialized' | 'parallel_invalid';
  activeMutationLane: string | null;
  mergeAuthority: 'denied';
  nextGate:
    | 'reorient_and_repair'
    | 'serialize_mutation'
    | 'complete_exact_head_proof'
    | 'obtain_independent_semantic_review'
    | 'hold_external_blocker'
    | 'founder_final_required';
  reasoningProfile: readonly FounderOodaReasoningLens[];
  findings: FounderOodaWorkflowFinding[];
};

function normalizedSha(value: string | null): string | null {
  const sha = value?.trim().toLowerCase() ?? '';
  return FULL_SHA.test(sha) ? sha : null;
}

function normalizedFingerprint(value: string | null): string | null {
  const fingerprint = value?.trim().toLowerCase() ?? '';
  return SHA256.test(fingerprint) ? fingerprint : null;
}

function normalizedText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

function normalizedPrNumber(value: number | null): number | null {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : null;
}

function prIdentityIsValid(value: number | null): boolean {
  return value === null || normalizedPrNumber(value) !== null;
}

function snapshotIsWellFormed(snapshot: ParallelFixAuditSnapshot): boolean {
  return Boolean(
    normalizedText(snapshot.repository)
    && normalizedText(snapshot.targetBranch)
    && normalizedSha(snapshot.baseSha)
    && normalizedSha(snapshot.headSha)
    && prIdentityIsValid(snapshot.prNumber)
    && normalizedFingerprint(snapshot.diffFingerprint),
  );
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function evaluateFounderOodaWorkflow(
  input: EvaluateFounderOodaWorkflowInput,
): FounderOodaWorkflowEvaluation {
  const findings: FounderOodaWorkflowFinding[] = [];
  const auditedAtMs = Date.parse(input.auditedAt);
  const requestedWindow = input.freshnessWindowMs ?? DEFAULT_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowValid = Number.isInteger(requestedWindow)
    && requestedWindow > 0
    && requestedWindow <= MAX_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowMs = freshnessWindowValid
    ? requestedWindow
    : DEFAULT_PR_AUDIT_FRESHNESS_MS;

  if (Number.isNaN(auditedAtMs)) findings.push('workflow_invalid_audit_time');
  if (!freshnessWindowValid) findings.push('workflow_invalid_freshness_window');

  const currentBaseSha = normalizedSha(input.current.baseSha);
  const currentHeadSha = normalizedSha(input.current.headSha);

  if (!snapshotIsWellFormed(input.current)) findings.push('workflow_current_snapshot_malformed');
  if (input.current.evidenceState === 'evidence_incomplete') {
    findings.push('workflow_current_evidence_incomplete');
  }
  if (input.current.evidenceState === 'evidence_conflicted') {
    findings.push('workflow_current_evidence_conflicted');
  }
  if (input.current.actorIdentityState !== 'verified') {
    findings.push('workflow_current_actor_unverified');
  }

  const currentObservedAtMs = input.current.observedAt
    ? Date.parse(input.current.observedAt)
    : Number.NaN;
  if (
    Number.isNaN(currentObservedAtMs)
    || (!Number.isNaN(auditedAtMs) && currentObservedAtMs > auditedAtMs)
  ) {
    findings.push('workflow_current_observation_time_unknown');
  } else if (!Number.isNaN(auditedAtMs) && auditedAtMs - currentObservedAtMs > freshnessWindowMs) {
    findings.push('workflow_current_observation_stale');
  }

  if (
    input.parallelAudit.state !== 'evidence_complete'
    || input.parallelAudit.dependentProof !== 'current'
    || input.parallelAudit.currentBaseSha !== currentBaseSha
    || input.parallelAudit.currentHeadSha !== currentHeadSha
  ) {
    findings.push('workflow_parallel_truth_not_current');
  }

  const normalizedMutationLanes = [...new Set(
    input.activeMutationLanes
      .map((lane) => normalizedText(lane))
      .filter((lane): lane is string => lane !== null),
  )];
  if (normalizedMutationLanes.length > 1) {
    findings.push('workflow_parallel_mutation_detected');
  }

  const laneInputs: Array<{
    expectedLane: WorkflowLaneName;
    observation: WorkflowLaneObservation;
    required: boolean;
  }> = [
    { expectedLane: 'machine', observation: input.machine, required: true },
    { expectedLane: 'provider', observation: input.provider, required: input.providerRequired },
    { expectedLane: 'governance', observation: input.governance, required: input.governanceRequired },
  ];

  for (const { expectedLane, observation, required } of laneInputs) {
    if (observation.lane !== expectedLane) findings.push('workflow_lane_identity_mismatch');
    if (!required) continue;

    if (
      normalizedSha(observation.baseSha) !== currentBaseSha
      || normalizedSha(observation.headSha) !== currentHeadSha
    ) {
      findings.push('workflow_lane_fingerprint_mismatch');
    }

    const observedAtMs = observation.observedAt
      ? Date.parse(observation.observedAt)
      : Number.NaN;
    if (
      Number.isNaN(observedAtMs)
      || (!Number.isNaN(auditedAtMs) && observedAtMs > auditedAtMs)
    ) {
      findings.push('workflow_lane_observation_time_unknown');
    } else if (!Number.isNaN(auditedAtMs) && auditedAtMs - observedAtMs > freshnessWindowMs) {
      findings.push('workflow_lane_observation_stale');
    }

    if (observation.state === 'conflicted') findings.push('workflow_lane_conflicted');
    if (observation.state === 'blocked') findings.push('workflow_lane_blocked');
  }

  if (input.machine.state !== 'complete') findings.push('workflow_machine_not_complete');
  if (input.providerRequired) {
    if (input.provider.state === 'candidate_only') findings.push('workflow_provider_candidate_only');
    if (input.provider.state !== 'complete') findings.push('workflow_provider_required_not_complete');
  }
  if (input.governanceRequired && input.governance.state !== 'complete') {
    findings.push('workflow_governance_required_not_complete');
  }

  let currentReviewClean = false;
  let currentReviewFindings = false;
  let currentReviewPending = false;
  let currentReviewBlocked = false;
  let sawReviewAttempt = false;

  for (const attempt of input.reviewAttempts) {
    sawReviewAttempt = true;
    if (attempt.reviewerIdentityState !== 'verified' || !normalizedText(attempt.reviewerId)) {
      findings.push('workflow_review_actor_unverified');
      continue;
    }
    if (normalizedSha(attempt.headSha) !== currentHeadSha) {
      findings.push('workflow_review_stale_for_head');
      continue;
    }

    const observedAtMs = attempt.observedAt ? Date.parse(attempt.observedAt) : Number.NaN;
    if (
      Number.isNaN(observedAtMs)
      || (!Number.isNaN(auditedAtMs) && observedAtMs > auditedAtMs)
    ) {
      findings.push('workflow_review_observation_time_unknown');
      continue;
    }
    if (!Number.isNaN(auditedAtMs) && auditedAtMs - observedAtMs > freshnessWindowMs) {
      findings.push('workflow_review_observation_stale');
      continue;
    }

    if (attempt.state === 'clean' && (attempt.findingCount ?? 0) === 0) {
      currentReviewClean = true;
      continue;
    }
    if (attempt.state === 'findings' || (attempt.findingCount ?? 0) > 0) {
      currentReviewFindings = true;
      continue;
    }
    if (attempt.state === 'pending') {
      currentReviewPending = true;
      continue;
    }
    currentReviewBlocked = true;
  }

  let semanticReview: FounderOodaWorkflowEvaluation['semanticReview'];
  if (currentReviewFindings) {
    semanticReview = 'findings';
    findings.push('workflow_review_findings');
  } else if (currentReviewClean) {
    semanticReview = 'clean';
  } else if (currentReviewPending) {
    semanticReview = 'pending';
  } else if (currentReviewBlocked || sawReviewAttempt) {
    semanticReview = 'blocked';
    findings.push('workflow_review_blocked');
  } else {
    semanticReview = 'pending';
    findings.push('workflow_review_missing');
  }

  const normalizedFindings = sortedUnique(findings);
  const staleProofFindings = new Set<FounderOodaWorkflowFinding>([
    'workflow_parallel_truth_not_current',
    'workflow_current_snapshot_malformed',
    'workflow_current_evidence_conflicted',
    'workflow_current_observation_time_unknown',
    'workflow_current_observation_stale',
    'workflow_lane_fingerprint_mismatch',
    'workflow_lane_observation_time_unknown',
    'workflow_lane_observation_stale',
    'workflow_lane_conflicted',
  ]);
  const dependentProof = input.parallelAudit.dependentProof === 'current'
    && !normalizedFindings.some((finding) => staleProofFindings.has(finding))
    ? 'current'
    : 'stale';

  const repairFindings = new Set<FounderOodaWorkflowFinding>([
    'workflow_parallel_truth_not_current',
    'workflow_current_snapshot_malformed',
    'workflow_current_evidence_conflicted',
    'workflow_lane_identity_mismatch',
    'workflow_lane_fingerprint_mismatch',
    'workflow_lane_conflicted',
    'workflow_review_findings',
  ]);
  const blockedFindings = new Set<FounderOodaWorkflowFinding>([
    'workflow_current_actor_unverified',
    'workflow_parallel_mutation_detected',
    'workflow_lane_blocked',
    'workflow_review_actor_unverified',
    'workflow_review_blocked',
  ]);
  const verifyingFindings = new Set<FounderOodaWorkflowFinding>([
    'workflow_current_evidence_incomplete',
    'workflow_current_observation_time_unknown',
    'workflow_current_observation_stale',
    'workflow_invalid_audit_time',
    'workflow_invalid_freshness_window',
    'workflow_lane_observation_time_unknown',
    'workflow_lane_observation_stale',
    'workflow_machine_not_complete',
    'workflow_provider_required_not_complete',
    'workflow_provider_candidate_only',
    'workflow_governance_required_not_complete',
  ]);

  const hasRepair = normalizedFindings.some((finding) => repairFindings.has(finding));
  const hasBlocked = normalizedFindings.some((finding) => blockedFindings.has(finding));
  const hasVerifying = normalizedFindings.some((finding) => verifyingFindings.has(finding));

  let state: FounderOodaWorkflowState;
  if (hasRepair) state = 'repair';
  else if (hasBlocked) state = 'blocked';
  else if (hasVerifying) state = 'verifying';
  else if (semanticReview !== 'clean') state = 'review_pending';
  else state = 'founder_final_required';

  const mutationMode = normalizedMutationLanes.length > 1 ? 'parallel_invalid' : 'serialized';
  let nextGate: FounderOodaWorkflowEvaluation['nextGate'];
  if (normalizedFindings.includes('workflow_parallel_mutation_detected')) {
    nextGate = 'serialize_mutation';
  } else if (state === 'repair') {
    nextGate = 'reorient_and_repair';
  } else if (state === 'verifying') {
    nextGate = 'complete_exact_head_proof';
  } else if (state === 'review_pending') {
    nextGate = 'obtain_independent_semantic_review';
  } else if (state === 'blocked') {
    nextGate = 'hold_external_blocker';
  } else {
    nextGate = 'founder_final_required';
  }

  return {
    state,
    semanticReview,
    dependentProof,
    mutationMode,
    activeMutationLane: normalizedMutationLanes[0] ?? null,
    mergeAuthority: 'denied',
    nextGate,
    reasoningProfile: FOUNDER_OODA_REASONING_PROFILE,
    findings: normalizedFindings,
  };
}
