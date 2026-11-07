import { describe, expect, it } from 'vitest';
import type { ParallelFixAuditEvaluation, ParallelFixAuditSnapshot } from '../types.js';
import {
  FOUNDER_OODA_REASONING_PROFILE,
  evaluateFounderOodaWorkflow,
  type EvaluateFounderOodaWorkflowInput,
  type ProviderOutcomeWitness,
  type SemanticReviewAttempt,
  type WorkflowLaneObservation,
} from '../founderOodaWorkflow.js';
import {
  INDEPENDENT_REVIEW_CONTRACT,
  independentReviewHash,
  type IndependentReviewReceipt,
} from '../../../review/independentReviewGate.js';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const OTHER_HEAD_SHA = 'c'.repeat(40);
const OTHER_BASE_SHA = 'e'.repeat(40);
const DIFF_FINGERPRINT = 'd'.repeat(64);
const OTHER_DIFF = 'f'.repeat(64);
const POLICY_HASH = '9'.repeat(64);
const NOW = '2026-08-29T04:10:00.000Z';
const OBSERVED_AT = '2026-08-29T04:09:00.000Z';
const REPO = 'jussray/founder-control-room';

function snapshot(overrides: Partial<ParallelFixAuditSnapshot> = {}): ParallelFixAuditSnapshot {
  return { repository: REPO, targetBranch: 'main', baseSha: BASE_SHA, headSha: HEAD_SHA, prNumber: 704,
    diffFingerprint: DIFF_FINGERPRINT, evidenceState: 'evidence_complete', observedAt: OBSERVED_AT,
    actorId: 'independent-auditor', actorIdentityState: 'verified', ...overrides };
}
function parallelAudit(overrides: Partial<ParallelFixAuditEvaluation> = {}): ParallelFixAuditEvaluation {
  return { state: 'evidence_complete', currentRepository: REPO, currentTargetBranch: 'main', currentBaseSha: BASE_SHA,
    currentHeadSha: HEAD_SHA, currentPrNumber: 704, currentDiffFingerprint: DIFF_FINGERPRINT,
    dependentProof: 'current', findings: [], ...overrides };
}
function lane(laneName: WorkflowLaneObservation['lane'], overrides: Partial<WorkflowLaneObservation> = {}): WorkflowLaneObservation {
  return { lane: laneName, state: 'complete', baseSha: BASE_SHA, headSha: HEAD_SHA, observedAt: OBSERVED_AT, ...overrides };
}
function receipt(overrides: Partial<IndependentReviewReceipt> = {}): IndependentReviewReceipt {
  const base: IndependentReviewReceipt = {
    contract: INDEPENDENT_REVIEW_CONTRACT, repository: REPO, pullRequestNumber: 704, baseSha: BASE_SHA, headSha: HEAD_SHA,
    diffHash: DIFF_FINGERPRINT, policyHash: POLICY_HASH,
    reviewer: { id: 'independent-reviewer', kind: 'semantic', provider: 'github', runtime: 'provider-review' },
    authorIdentity: 'builder', findings: [], verdict: 'clear', summary: 'clear', proposalOnly: true,
    mergeAuthorized: false, executionAuthorized: false, reviewHash: '',
  };
  const merged = { ...base, ...overrides } as IndependentReviewReceipt;
  merged.reviewHash = independentReviewHash({ ...merged, reviewHash: '' });
  return merged;
}
function review(overrides: Partial<SemanticReviewAttempt> = {}, r = receipt()): SemanticReviewAttempt {
  return { reviewerId: r.reviewer.id, state: 'clean', baseSha: BASE_SHA, headSha: HEAD_SHA,
    diffFingerprint: DIFF_FINGERPRINT, observedAt: OBSERVED_AT, findingCount: 0, reviewReceiptHash: r.reviewHash, ...overrides };
}
function providerWitness(overrides: Partial<ProviderOutcomeWitness> = {}): ProviderOutcomeWitness {
  return { receiptId: 'provider-receipt-1', provider: 'cloudflare', project: 'founder-control-room', environment: 'preview',
    repository: REPO, targetBranch: 'main', baseSha: BASE_SHA, headSha: HEAD_SHA, diffFingerprint: DIFF_FINGERPRINT,
    observedAt: OBSERVED_AT, identityState: 'verified', outcome: 'observed_complete', ...overrides };
}
function input(overrides: Partial<EvaluateFounderOodaWorkflowInput> = {}): EvaluateFounderOodaWorkflowInput {
  const r = receipt();
  return {
    parallelAudit: parallelAudit(), current: snapshot(), machine: lane('machine'),
    provider: lane('provider', { state: 'candidate_only' }), governance: lane('governance', { state: 'not_applicable' }),
    providerRequired: false, governanceRequired: false, providerProofIndex: new Map(),
    reviewAttempts: [review({}, r)], independentReviewReceiptIndex: new Map([[r.reviewHash, r]]),
    activeMutationLanes: ['existing-pr-704-writer'], auditedAt: NOW, freshnessWindowMs: 5 * 60 * 1000, ...overrides,
  };
}

describe('evaluateFounderOodaWorkflow', () => {
  it('implements the reasoning profile while keeping merge authority denied', () => {
    const result = evaluateFounderOodaWorkflow(input());
    expect(result.state).toBe('founder_final_required');
    expect(result.semanticReview).toBe('clean');
    expect(result.dependentProof).toBe('current');
    expect(result.mergeAuthority).toBe('denied');
    expect(result.reasoningProfile).toEqual(FOUNDER_OODA_REASONING_PROFILE);
    expect(result.findings).toEqual([]);
  });

  it('blocks two writer instances even when their labels are identical', () => {
    const result = evaluateFounderOodaWorkflow(input({ activeMutationLanes: ['writer', 'writer'] }));
    expect(result.state).toBe('blocked');
    expect(result.findings).toContain('workflow_parallel_mutation_detected');
    expect(result.activeMutationLane).toBeNull();
  });

  it('binds parallel truth to repository target PR base head and diff', () => {
    const result = evaluateFounderOodaWorkflow(input({ parallelAudit: parallelAudit({ currentRepository: 'jussray/other' }) }));
    expect(result.state).toBe('repair');
    expect(result.dependentProof).toBe('stale');
    expect(result.findings).toContain('workflow_parallel_truth_not_current');
  });

  it('rejects a clean review without a trusted immutable receipt', () => {
    const result = evaluateFounderOodaWorkflow(input({ independentReviewReceiptIndex: new Map() }));
    expect(result.state).toBe('blocked');
    expect(result.findings).toContain('workflow_review_receipt_untrusted');
  });

  it('rejects self-review from a trusted receipt', () => {
    const r = receipt({ reviewer: { id: 'builder', kind: 'semantic', provider: 'github', runtime: 'provider-review' }, authorIdentity: 'builder' });
    const result = evaluateFounderOodaWorkflow(input({ reviewAttempts: [review({ reviewerId: 'builder' }, r)], independentReviewReceiptIndex: new Map([[r.reviewHash, r]]) }));
    expect(result.state).toBe('blocked');
    expect(result.findings).toEqual(expect.arrayContaining(['workflow_review_receipt_untrusted', 'workflow_review_not_independent']));
  });

  it('rejects review receipts from the old base or old diff even when head is unchanged', () => {
    expect(evaluateFounderOodaWorkflow(input({ reviewAttempts: [review({ baseSha: OTHER_BASE_SHA })] })).findings)
      .toContain('workflow_review_stale_for_fingerprint');
    expect(evaluateFounderOodaWorkflow(input({ reviewAttempts: [review({ diffFingerprint: OTHER_DIFF })] })).findings)
      .toContain('workflow_review_stale_for_fingerprint');
  });

  it('does not let a historical head review donate authority', () => {
    const result = evaluateFounderOodaWorkflow(input({ reviewAttempts: [review({ headSha: OTHER_HEAD_SHA })] }));
    expect(result.state).toBe('blocked');
    expect(result.findings).toEqual(expect.arrayContaining(['workflow_review_stale_for_head', 'workflow_review_blocked']));
  });

  it('accepts negative review evidence without letting it mint authority', () => {
    const result = evaluateFounderOodaWorkflow(input({ reviewAttempts: [review({ state: 'findings', findingCount: 2, reviewReceiptHash: null })], independentReviewReceiptIndex: new Map() }));
    expect(result.state).toBe('repair');
    expect(result.semanticReview).toBe('findings');
    expect(result.findings).toContain('workflow_review_findings');
  });

  it('treats quota and accepted-no-output as blocked, never green', () => {
    const result = evaluateFounderOodaWorkflow(input({ reviewAttempts: [review({ state: 'quota_blocked', reviewReceiptHash: null }), review({ reviewerId: 'alternate', state: 'request_accepted_no_output', reviewReceiptHash: null })], independentReviewReceiptIndex: new Map() }));
    expect(result.semanticReview).toBe('blocked');
    expect(result.state).toBe('blocked');
  });

  it('keeps candidate-only provider evidence below load-bearing provider truth', () => {
    const result = evaluateFounderOodaWorkflow(input({ providerRequired: true, provider: lane('provider', { state: 'candidate_only' }) }));
    expect(result.state).toBe('verifying');
    expect(result.dependentProof).toBe('stale');
  });

  it('rejects bare caller-labeled provider completion without trusted readback', () => {
    const result = evaluateFounderOodaWorkflow(input({ providerRequired: true, provider: lane('provider', { state: 'complete' }) }));
    expect(result.state).toBe('verifying');
    expect(result.findings).toContain('workflow_provider_proof_untrusted');
  });

  it('accepts provider completion only through an exact trusted outcome witness', () => {
    const witness = providerWitness();
    const result = evaluateFounderOodaWorkflow(input({ providerRequired: true,
      provider: lane('provider', { state: 'complete', providerReceiptId: witness.receiptId }),
      providerProofIndex: new Map([[witness.receiptId, witness]]) }));
    expect(result.state).toBe('founder_final_required');
    expect(result.findings).toEqual([]);
  });

  it('marks dependent proof stale whenever temporal validity is unknown or evidence incomplete', () => {
    expect(evaluateFounderOodaWorkflow(input({ auditedAt: 'not-a-time' })).dependentProof).toBe('stale');
    expect(evaluateFounderOodaWorkflow(input({ current: snapshot({ evidenceState: 'evidence_incomplete' }) })).dependentProof).toBe('stale');
  });
});
