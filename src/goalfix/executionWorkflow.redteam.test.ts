import { describe, expect, it } from 'vitest';
import {
  evaluateGoalfixExecution,
  goalfixCheckpointEvidenceFingerprint,
  goalfixDiffFingerprint,
  goalfixFounderDecisionFingerprint,
  goalfixMergeAncestryFingerprint,
  goalfixRuntimeReceiptFingerprint,
  goalfixSourceFingerprint,
  type GoalfixExecutionCheckpoint,
  type GoalfixExecutionInput,
  type GoalfixFounderDecision,
  type GoalfixMergeAncestryReceipt,
  type GoalfixRuntimeReceipt,
} from './executionWorkflow.js';
import { fingerprintNormalized, type ProofBinding, type ProofCookieContract } from '../security/attack20V3.js';

const REPOSITORY = 'jussray/founder-control-room';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const MERGED = 'c'.repeat(40);
const PR_NUMBER = 711;
const SOURCE_BRANCH = 'feat/focused-fix';
const TARGET_BRANCH = 'main';
const FOUNDER_PRINCIPAL = 'principal:founder';
const DIFF = goalfixDiffFingerprint({ base: BASE, head: HEAD, scope: 'goalfix-v2' });
const NOW = new Date('2026-08-26T12:00:00.000Z');

function cookie(id: string, contextType: ProofCookieContract['contextType'], parentCookieId: string | null = null): ProofCookieContract {
  return {
    cookieId: id,
    contextType,
    owner: contextType === 'founder-session' ? FOUNDER_PRINCIPAL : `principal:${contextType}`,
    createdAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-27T10:00:00.000Z',
    parentCookieId,
    revokedAt: null,
  };
}

const founder = cookie('cookie_founder_red001', 'founder-session');
const builder = cookie('cookie_builder_red001', 'builder-run', founder.cookieId);
const verifier = cookie('cookie_verify_red0001', 'verification-run', builder.cookieId);
const redteam = cookie('cookie_redteam_red001', 'verification-run', builder.cookieId);
const provider = cookie('cookie_provider_red01', 'provider-run', verifier.cookieId);

function checkpoint(
  phase: GoalfixExecutionCheckpoint['phase'],
  role: GoalfixExecutionCheckpoint['role'],
  actorId: string,
  proofCookie: ProofCookieContract,
  observedAt: string,
): GoalfixExecutionCheckpoint {
  const candidate: GoalfixExecutionCheckpoint = {
    phase,
    role,
    actorId,
    verdict: 'PASS',
    repository: REPOSITORY,
    baseSha: BASE,
    headSha: HEAD,
    diffFingerprint: DIFF,
    evidenceIds: [`evidence:${phase}`],
    observedAt,
    proofBinding: { fingerprints: {}, cookieContract: proofCookie },
  };
  candidate.proofBinding = {
    fingerprints: {
      sourceSha: goalfixSourceFingerprint(REPOSITORY, HEAD),
      evidenceBundle: goalfixCheckpointEvidenceFingerprint(candidate),
    },
    cookieContract: proofCookie,
  };
  return candidate;
}

function founderDecision(): GoalfixFounderDecision {
  const base: Omit<GoalfixFounderDecision, 'proofBinding'> = {
    decisionId: 'decision-redteam-001',
    action: 'MERGE',
    approvedBy: FOUNDER_PRINCIPAL,
    pullRequestNumber: PR_NUMBER,
    sourceBranch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    approvedBaseSha: BASE,
    approvedHeadSha: HEAD,
    approvedDiffFingerprint: DIFF,
    approvedAt: '2026-08-26T11:45:00.000Z',
  };
  return {
    ...base,
    proofBinding: {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, HEAD),
        evidenceBundle: goalfixFounderDecisionFingerprint(base, REPOSITORY),
      },
      cookieContract: founder,
    },
  };
}

function ancestry(overrides: Partial<GoalfixMergeAncestryReceipt> = {}): GoalfixMergeAncestryReceipt {
  const base: Omit<GoalfixMergeAncestryReceipt, 'proofBinding'> = {
    receiptId: 'merge-ancestry-red001',
    repository: REPOSITORY,
    pullRequestNumber: PR_NUMBER,
    sourceBranch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    candidateHeadSha: HEAD,
    candidateDiffFingerprint: DIFF,
    mergedSha: MERGED,
    currentMainSha: MERGED,
    containsCandidate: true,
    observedAt: '2026-08-26T11:45:00.000Z',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'proofBinding')),
  } as Omit<GoalfixMergeAncestryReceipt, 'proofBinding'>;
  return {
    ...base,
    proofBinding: overrides.proofBinding ?? {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, base.mergedSha),
        evidenceBundle: goalfixMergeAncestryFingerprint(base),
      },
      cookieContract: provider,
    },
  };
}

function runtimeReceipt(): GoalfixRuntimeReceipt {
  const base: Omit<GoalfixRuntimeReceipt, 'proofBinding'> = {
    receiptId: 'runtime-receipt-red001',
    mergedSha: MERGED,
    verdict: 'PASS',
    observedAt: '2026-08-26T11:50:00.000Z',
  };
  return {
    ...base,
    proofBinding: {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED),
        runtime: fingerprintNormalized({ mergedSha: MERGED, state: 'runtime-readback' }),
        evidenceBundle: goalfixRuntimeReceiptFingerprint(base),
      },
      cookieContract: provider,
    },
  };
}

function validInput(): GoalfixExecutionInput {
  return {
    repository: REPOSITORY,
    pullRequestNumber: PR_NUMBER,
    branch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    trustedFounderPrincipalId: FOUNDER_PRINCIPAL,
    baseSha: BASE,
    candidateHeadSha: HEAD,
    currentMainSha: BASE,
    diffFingerprint: DIFF,
    goal: 'Keep implementation and proof exact-head bound.',
    stopCondition: 'Stop at the next unmet authority or evidence gate.',
    rollback: 'Close unmerged or revert the focused commit.',
    strategicPreflight: {
      authoritativeRepositoryKnown: true,
      targetBranchKnown: true,
      exactBaseShaKnown: true,
      founderOutcomeKnown: true,
      suspectedFailureAreaKnown: true,
      firstEvidenceTargetsKnown: true,
      stopConditionDefined: true,
      smallestReversibleChangeChosen: true,
      rollbackDefined: true,
      proofPlanDefined: true,
      unrelatedWorkPreserved: true,
    },
    checkpoints: [
      checkpoint('observe', 'system', 'observer', builder, '2026-08-26T10:40:00.000Z'),
      checkpoint('orient', 'system', 'orienter', builder, '2026-08-26T10:45:00.000Z'),
      checkpoint('decide', 'founder', 'founder', founder, '2026-08-26T10:50:00.000Z'),
      checkpoint('builder', 'builder', 'builder', builder, '2026-08-26T11:00:00.000Z'),
      checkpoint('verify', 'verifier', 'verifier', verifier, '2026-08-26T11:10:00.000Z'),
      checkpoint('redteam', 'redteam', 'redteam', redteam, '2026-08-26T11:20:00.000Z'),
    ],
    cookieIndex: new Map([
      [founder.cookieId, founder],
      [builder.cookieId, builder],
      [verifier.cookieId, verifier],
      [redteam.cookieId, redteam],
      [provider.cookieId, provider],
    ]),
    founderDecision: founderDecision(),
    now: NOW,
  };
}

describe('Goalfix execution workflow v2 red team', () => {
  it('refuses to skip Observe even when later lanes are green', () => {
    const candidate = validInput();
    candidate.checkpoints = candidate.checkpoints.filter((item) => item.phase !== 'observe');

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.currentPhase).toBe('observe');
  });

  it('rejects post-merge truth carrying a fingerprint for the pre-merge head', () => {
    const candidate = validInput();
    const runtime = runtimeReceipt();
    candidate.postMergeTruth = {
      mergedSha: MERGED,
      currentMainSha: MERGED,
      runtimeProofRequired: true,
      runtimeReceiptIds: [runtime.receiptId],
      runtimeReceipts: [runtime],
      mergeAncestryReceipt: ancestry(),
      observedAt: '2026-08-26T11:55:00.000Z',
      proofBinding: {
        fingerprints: { sourceSha: goalfixSourceFingerprint(REPOSITORY, HEAD) },
        cookieContract: provider,
      },
    };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('post-merge sourceSha proof fingerprint does not match merged/current-main SHA');
  });

  it('rejects a caller claiming merged main without candidate ancestry', () => {
    const candidate = validInput();
    const runtime = runtimeReceipt();
    candidate.postMergeTruth = {
      mergedSha: MERGED,
      currentMainSha: MERGED,
      runtimeProofRequired: true,
      runtimeReceiptIds: [runtime.receiptId],
      runtimeReceipts: [runtime],
      mergeAncestryReceipt: ancestry({ containsCandidate: false }),
      observedAt: '2026-08-26T11:55:00.000Z',
      proofBinding: {
        fingerprints: { sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED) },
        cookieContract: provider,
      },
    };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('merge ancestry does not prove merged main contains the approved candidate');
  });
});