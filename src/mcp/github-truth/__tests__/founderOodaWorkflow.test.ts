import { describe, expect, it } from 'vitest';
import type {
  ParallelFixAuditEvaluation,
  ParallelFixAuditSnapshot,
} from '../types.js';
import {
  FOUNDER_OODA_REASONING_PROFILE,
  evaluateFounderOodaWorkflow,
  type EvaluateFounderOodaWorkflowInput,
  type SemanticReviewAttempt,
  type WorkflowLaneObservation,
} from '../founderOodaWorkflow.js';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const OTHER_HEAD_SHA = 'c'.repeat(40);
const DIFF_FINGERPRINT = 'd'.repeat(64);
const NOW = '2026-08-29T04:10:00.000Z';
const OBSERVED_AT = '2026-08-29T04:09:00.000Z';

function snapshot(overrides: Partial<ParallelFixAuditSnapshot> = {}): ParallelFixAuditSnapshot {
  return {
    repository: 'jussray/founder-control-room',
    targetBranch: 'main',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    prNumber: 704,
    diffFingerprint: DIFF_FINGERPRINT,
    evidenceState: 'evidence_complete',
    observedAt: OBSERVED_AT,
    actorId: 'independent-auditor',
    actorIdentityState: 'verified',
    ...overrides,
  };
}

function parallelAudit(overrides: Partial<ParallelFixAuditEvaluation> = {}): ParallelFixAuditEvaluation {
  return {
    state: 'evidence_complete',
    currentBaseSha: BASE_SHA,
    currentHeadSha: HEAD_SHA,
    dependentProof: 'current',
    findings: [],
    ...overrides,
  };
}

function lane(
  laneName: WorkflowLaneObservation['lane'],
  overrides: Partial<WorkflowLaneObservation> = {},
): WorkflowLaneObservation {
  return {
    lane: laneName,
    state: 'complete',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function review(overrides: Partial<SemanticReviewAttempt> = {}): SemanticReviewAttempt {
  return {
    reviewerId: 'independent-reviewer',
    reviewerIdentityState: 'verified',
    state: 'clean',
    headSha: HEAD_SHA,
    observedAt: OBSERVED_AT,
    findingCount: 0,
    ...overrides,
  };
}

function input(
  overrides: Partial<EvaluateFounderOodaWorkflowInput> = {},
): EvaluateFounderOodaWorkflowInput {
  return {
    parallelAudit: parallelAudit(),
    current: snapshot(),
    machine: lane('machine'),
    provider: lane('provider', { state: 'candidate_only' }),
    governance: lane('governance', { state: 'not_applicable' }),
    providerRequired: false,
    governanceRequired: false,
    reviewAttempts: [review()],
    activeMutationLanes: ['existing-pr-704-writer'],
    auditedAt: NOW,
    freshnessWindowMs: 5 * 60 * 1000,
    ...overrides,
  };
}

describe('evaluateFounderOodaWorkflow', () => {
  it('implements ULTRATHINK + Redteam + Lindy + L99 + OODA without minting merge authority', () => {
    const result = evaluateFounderOodaWorkflow(input());

    expect(result).toEqual({
      state: 'founder_final_required',
      semanticReview: 'clean',
      dependentProof: 'current',
      mutationMode: 'serialized',
      activeMutationLane: 'existing-pr-704-writer',
      mergeAuthority: 'denied',
      nextGate: 'founder_final_required',
      reasoningProfile: FOUNDER_OODA_REASONING_PROFILE,
      findings: [],
    });
    expect(result.reasoningProfile).toEqual([
      'ultrathink',
      'redteam_premise',
      'lindy',
      'l99',
      'ooda',
      'redteam_solution',
    ]);
  });

  it('allows parallel observation but blocks parallel mutation', () => {
    const result = evaluateFounderOodaWorkflow(input({
      activeMutationLanes: ['source-writer', 'provider-writer'],
    }));

    expect(result.state).toBe('blocked');
    expect(result.mutationMode).toBe('parallel_invalid');
    expect(result.nextGate).toBe('serialize_mutation');
    expect(result.findings).toContain('workflow_parallel_mutation_detected');
    expect(result.mergeAuthority).toBe('denied');
  });

  it('invalidates dependent proof when a load-bearing lane moves off the exact head', () => {
    const result = evaluateFounderOodaWorkflow(input({
      machine: lane('machine', { headSha: OTHER_HEAD_SHA }),
    }));

    expect(result.state).toBe('repair');
    expect(result.dependentProof).toBe('stale');
    expect(result.nextGate).toBe('reorient_and_repair');
    expect(result.findings).toContain('workflow_lane_fingerprint_mismatch');
  });

  it('treats Codex quota plus an accepted reviewer request with no output as BLOCKED, never green', () => {
    const result = evaluateFounderOodaWorkflow(input({
      reviewAttempts: [
        review({ reviewerId: 'codex', state: 'quota_blocked' }),
        review({ reviewerId: 'copilot', state: 'request_accepted_no_output' }),
      ],
    }));

    expect(result.state).toBe('blocked');
    expect(result.semanticReview).toBe('blocked');
    expect(result.nextGate).toBe('hold_external_blocker');
    expect(result.findings).toContain('workflow_review_blocked');
    expect(result.mergeAuthority).toBe('denied');
  });

  it('lets a fresh alternate independent reviewer recover a blocked reviewer lane', () => {
    const result = evaluateFounderOodaWorkflow(input({
      reviewAttempts: [
        review({ reviewerId: 'codex', state: 'quota_blocked' }),
        review({ reviewerId: 'alternate-reviewer', state: 'clean' }),
      ],
    }));

    expect(result.state).toBe('founder_final_required');
    expect(result.semanticReview).toBe('clean');
    expect(result.findings).toEqual([]);
  });

  it('does not let a historical clean review donate authority to the current head', () => {
    const result = evaluateFounderOodaWorkflow(input({
      reviewAttempts: [review({ headSha: OTHER_HEAD_SHA })],
    }));

    expect(result.state).toBe('blocked');
    expect(result.semanticReview).toBe('blocked');
    expect(result.findings).toEqual(expect.arrayContaining([
      'workflow_review_stale_for_head',
      'workflow_review_blocked',
    ]));
  });

  it('routes current reviewer findings back to repair instead of treating review as a checkbox', () => {
    const result = evaluateFounderOodaWorkflow(input({
      reviewAttempts: [review({ state: 'findings', findingCount: 2 })],
    }));

    expect(result.state).toBe('repair');
    expect(result.semanticReview).toBe('findings');
    expect(result.nextGate).toBe('reorient_and_repair');
    expect(result.findings).toContain('workflow_review_findings');
  });

  it('keeps provider preview/build evidence below runtime truth when provider proof is load-bearing', () => {
    const result = evaluateFounderOodaWorkflow(input({
      providerRequired: true,
      provider: lane('provider', { state: 'candidate_only' }),
    }));

    expect(result.state).toBe('verifying');
    expect(result.nextGate).toBe('complete_exact_head_proof');
    expect(result.findings).toEqual(expect.arrayContaining([
      'workflow_provider_candidate_only',
      'workflow_provider_required_not_complete',
    ]));
  });

  it('does not require provider promotion proof when the provider lane is explicitly non-load-bearing', () => {
    const result = evaluateFounderOodaWorkflow(input({
      providerRequired: false,
      provider: lane('provider', { state: 'candidate_only' }),
    }));

    expect(result.state).toBe('founder_final_required');
    expect(result.findings).toEqual([]);
  });

  it('holds when live governance is required but unavailable or drifted', () => {
    const result = evaluateFounderOodaWorkflow(input({
      governanceRequired: true,
      governance: lane('governance', { state: 'blocked' }),
    }));

    expect(result.state).toBe('blocked');
    expect(result.nextGate).toBe('hold_external_blocker');
    expect(result.findings).toEqual(expect.arrayContaining([
      'workflow_lane_blocked',
      'workflow_governance_required_not_complete',
    ]));
  });

  it('keeps machine green separate from missing semantic review', () => {
    const result = evaluateFounderOodaWorkflow(input({ reviewAttempts: [] }));

    expect(result.state).toBe('review_pending');
    expect(result.semanticReview).toBe('pending');
    expect(result.nextGate).toBe('obtain_independent_semantic_review');
    expect(result.findings).toContain('workflow_review_missing');
  });

  it('fails closed when the current independent audit no longer matches current base/head truth', () => {
    const result = evaluateFounderOodaWorkflow(input({
      parallelAudit: parallelAudit({ currentHeadSha: OTHER_HEAD_SHA, dependentProof: 'stale' }),
    }));

    expect(result.state).toBe('repair');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('workflow_parallel_truth_not_current');
  });

  it('requires current evidence and verified actor identity before promotion to Founder Final', () => {
    const result = evaluateFounderOodaWorkflow(input({
      current: snapshot({
        evidenceState: 'evidence_incomplete',
        actorIdentityState: 'unverified',
      }),
    }));

    expect(result.state).toBe('blocked');
    expect(result.findings).toEqual(expect.arrayContaining([
      'workflow_current_evidence_incomplete',
      'workflow_current_actor_unverified',
    ]));
  });
});
