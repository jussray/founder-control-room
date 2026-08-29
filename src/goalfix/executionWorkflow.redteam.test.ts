import { describe, expect, it } from 'vitest';
import {
  evaluateGoalfixExecution,
  goalfixCheckpointEvidenceFingerprint,
  goalfixDiffFingerprint,
  goalfixFounderDecisionFingerprint,
  goalfixMergeAncestryFingerprint,
  goalfixProviderMergeGateFingerprint,
  goalfixRuntimeReceiptFingerprint,
  goalfixSourceFingerprint,
  type GoalfixExecutionCheckpoint,
  type GoalfixExecutionInput,
  type GoalfixFounderDecision,
  type GoalfixMergeAncestryReceipt,
  type GoalfixProviderMergeGateReadback,
  type GoalfixRuntimeReceipt,
} from './executionWorkflow.js';
import { fingerprintNormalized, type ProofCookieContract } from '../security/attack20V3.js';

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
const RUNTIME_FINGERPRINT = fingerprintNormalized({ mergedSha: MERGED, state: 'runtime-readback' });
const PROVIDER_GATE_FINGERPRINT = fingerprintNormalized({ repository: REPOSITORY, provider: 'github-current-pr-readback' });

function cookie(
  id: string,
  contextType: ProofCookieContract['contextType'],
  parentCookieId: string | null = null,
  owner?: string,
): ProofCookieContract {
  return {
    cookieId: id,
    contextType,
    owner: owner ?? (contextType === 'founder-session' ? FOUNDER_PRINCIPAL : `principal:${contextType}`),
    createdAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-27T10:00:00.000Z',
    parentCookieId,
    revokedAt: null,
  };
}

const founder = cookie('cookie_founder_red001', 'founder-session');
const builder = cookie('cookie_builder_red001', 'builder-run', founder.cookieId, 'builder');
const verifier = cookie('cookie_verify_red0001', 'verification-run', builder.cookieId, 'verifier');
const redteam = cookie('cookie_redteam_red001', 'verification-run', builder.cookieId, 'redteam');
const provider = cookie('cookie_provider_red01', 'provider-run', verifier.cookieId, 'provider');

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

function providerMergeGateReadback(
  overrides: Partial<GoalfixProviderMergeGateReadback> = {},
): GoalfixProviderMergeGateReadback {
  const base: Omit<GoalfixProviderMergeGateReadback, 'proofBinding'> = {
    receiptId: 'provider-merge-gate-red001',
    repository: REPOSITORY,
    pullRequestNumber: PR_NUMBER,
    sourceBranch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    baseSha: BASE,
    headSha: HEAD,
    diffFingerprint: DIFF,
    pullRequestState: 'OPEN',
    requiredChecksState: 'PASS',
    reviewState: 'APPROVED',
    unresolvedMaterialThreads: 0,
    observedAt: '2026-08-26T11:46:00.000Z',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'proofBinding')),
  } as Omit<GoalfixProviderMergeGateReadback, 'proofBinding'>;
  return {
    ...base,
    proofBinding: overrides.proofBinding ?? {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, base.headSha),
        provider: PROVIDER_GATE_FINGERPRINT,
        evidenceBundle: goalfixProviderMergeGateFingerprint(base),
      },
      cookieContract: provider,
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
    mergedAt: '2026-08-26T11:47:00.000Z',
    observedAt: '2026-08-26T11:48:00.000Z',
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

function runtimeReceipt(observedAt = '2026-08-26T11:50:00.000Z'): GoalfixRuntimeReceipt {
  const base: Omit<GoalfixRuntimeReceipt, 'proofBinding'> = {
    receiptId: 'runtime-receipt-red001',
    mergedSha: MERGED,
    verdict: 'PASS',
    observedAt,
  };
  return {
    ...base,
    proofBinding: {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED),
        runtime: RUNTIME_FINGERPRINT,
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
    trustedRuntimeFingerprint: RUNTIME_FINGERPRINT,
    trustedProviderMergeGateFingerprint: PROVIDER_GATE_FINGERPRINT,
    providerMergeGateReadback: providerMergeGateReadback(),
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
    candidate.currentMainSha = MERGED;
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
        fingerprints: {
          sourceSha: goalfixSourceFingerprint(REPOSITORY, HEAD),
          runtime: RUNTIME_FINGERPRINT,
        },
        cookieContract: provider,
      },
    };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('post-merge sourceSha proof fingerprint does not match merged/current-main SHA');
  });

  it('rejects a caller claiming merged main without candidate ancestry', () => {
    const candidate = validInput();
    candidate.currentMainSha = MERGED;
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
        fingerprints: {
          sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED),
          runtime: RUNTIME_FINGERPRINT,
        },
        cookieContract: provider,
      },
    };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('merge ancestry does not prove merged main contains the approved candidate');
  });

  it('fails closed when conflicting checkpoints share the same latest observation timestamp', () => {
    const candidate = validInput();
    const currentBuilder = candidate.checkpoints.find((item) => item.phase === 'builder');
    expect(currentBuilder).toBeDefined();
    const failedBuilder: GoalfixExecutionCheckpoint = {
      ...currentBuilder!,
      verdict: 'FAILED',
    };
    candidate.checkpoints = [...candidate.checkpoints, failedBuilder];

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('builder: conflicting checkpoints share the latest observedAt timestamp');
  });

  it('allows a later clean retry to supersede a historical tied checkpoint conflict', () => {
    const candidate = validInput();
    const currentBuilder = candidate.checkpoints.find((item) => item.phase === 'builder');
    expect(currentBuilder).toBeDefined();
    const tiedFailure: GoalfixExecutionCheckpoint = {
      ...currentBuilder!,
      verdict: 'FAILED',
    };
    const retry = checkpoint('builder', 'builder', 'builder', builder, '2026-08-26T11:05:00.000Z');
    candidate.checkpoints = [...candidate.checkpoints, tiedFailure, retry];

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('READY_TO_MERGE');
  });

  it('rejects runtime PASS evidence observed before the provider merge time', () => {
    const candidate = validInput();
    candidate.currentMainSha = MERGED;
    const runtime = runtimeReceipt('2026-08-26T11:46:00.000Z');
    candidate.postMergeTruth = {
      mergedSha: MERGED,
      currentMainSha: MERGED,
      runtimeProofRequired: true,
      runtimeReceiptIds: [runtime.receiptId],
      runtimeReceipts: [runtime],
      mergeAncestryReceipt: ancestry(),
      observedAt: '2026-08-26T11:55:00.000Z',
      proofBinding: {
        fingerprints: {
          sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED),
          runtime: RUNTIME_FINGERPRINT,
        },
        cookieContract: provider,
      },
    };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('runtime-receipt-red001: runtime receipt predates provider merge');
  });
});
