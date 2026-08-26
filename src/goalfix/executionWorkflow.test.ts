import { describe, expect, it } from 'vitest';
import {
  evaluateGoalfixExecution,
  goalfixDiffFingerprint,
  goalfixSourceFingerprint,
  type GoalfixExecutionCheckpoint,
  type GoalfixExecutionInput,
  type GoalfixExecutionPhase,
  type GoalfixExecutionRole,
} from './executionWorkflow.js';
import type { ProofBinding, ProofCookieContract } from '../security/attack20V3.js';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const MERGED = 'c'.repeat(40);
const REPOSITORY = 'jussray/founder-control-room';
const NOW = new Date('2026-08-26T12:00:00.000Z');
const DIFF = goalfixDiffFingerprint({ files: ['src/goalfix/executionWorkflow.ts'], base: BASE, head: HEAD });

function cookie(
  cookieId: string,
  contextType: ProofCookieContract['contextType'],
  parentCookieId: string | null = null,
  overrides: Partial<ProofCookieContract> = {},
): ProofCookieContract {
  return {
    cookieId,
    contextType,
    owner: `principal:${contextType}`,
    createdAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-27T10:00:00.000Z',
    parentCookieId,
    revokedAt: null,
    ...overrides,
  };
}

const founderCookie = cookie('cookie_founder_000001', 'founder-session');
const builderCookie = cookie('cookie_builder_000001', 'builder-run', founderCookie.cookieId);
const verifierCookie = cookie('cookie_verify_000001', 'verification-run', founderCookie.cookieId);
const redteamCookie = cookie('cookie_redteam_000001', 'verification-run', founderCookie.cookieId);
const providerCookie = cookie('cookie_provider_00001', 'provider-run', founderCookie.cookieId);

function proofBinding(proofCookie: ProofCookieContract, head = HEAD): ProofBinding {
  return {
    fingerprints: {
      sourceSha: goalfixSourceFingerprint(REPOSITORY, head),
      evidenceBundle: goalfixDiffFingerprint({ cookie: proofCookie.cookieId, head }),
    },
    cookieContract: proofCookie,
  };
}

function checkpoint(
  phase: GoalfixExecutionPhase,
  role: GoalfixExecutionRole,
  actorId: string,
  proofCookie: ProofCookieContract,
  verdict: GoalfixExecutionCheckpoint['verdict'] = 'PASS',
): GoalfixExecutionCheckpoint {
  return {
    phase,
    role,
    actorId,
    verdict,
    repository: REPOSITORY,
    baseSha: BASE,
    headSha: HEAD,
    diffFingerprint: DIFF,
    evidenceIds: [`evidence:${phase}`],
    observedAt: '2026-08-26T11:00:00.000Z',
    proofBinding: proofBinding(proofCookie),
  };
}

function checkpoints(): GoalfixExecutionCheckpoint[] {
  return [
    checkpoint('observe', 'system', 'actor-observer', builderCookie),
    checkpoint('orient', 'system', 'actor-orient', builderCookie),
    checkpoint('decide', 'founder', 'actor-founder', founderCookie),
    checkpoint('builder', 'builder', 'actor-builder', builderCookie),
    checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie),
    checkpoint('redteam', 'redteam', 'actor-redteam', redteamCookie),
  ];
}

function input(overrides: Partial<GoalfixExecutionInput> = {}): GoalfixExecutionInput {
  const cookieIndex = new Map([
    [founderCookie.cookieId, founderCookie],
    [builderCookie.cookieId, builderCookie],
    [verifierCookie.cookieId, verifierCookie],
    [redteamCookie.cookieId, redteamCookie],
    [providerCookie.cookieId, providerCookie],
  ]);

  return {
    repository: REPOSITORY,
    branch: 'feat/focused-fix',
    baseSha: BASE,
    candidateHeadSha: HEAD,
    currentMainSha: BASE,
    diffFingerprint: DIFF,
    goal: 'Ship the smallest verified security repair.',
    stopCondition: 'Stop when exact-head verification, red team, and founder merge gate are satisfied.',
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
    checkpoints: checkpoints(),
    cookieIndex,
    founderDecision: null,
    postMergeTruth: null,
    now: NOW,
    ...overrides,
  };
}

describe('Goalfix execution workflow v2', () => {
  it('blocks before mutation when win-before-fighting preflight is incomplete', () => {
    const candidate = input();
    candidate.strategicPreflight = { ...candidate.strategicPreflight, rollbackDefined: false };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('BLOCKED_PRECONDITION');
    expect(result.mayMerge).toBe(false);
  });

  it('refuses Builder self-certification', () => {
    const candidate = input();
    candidate.checkpoints = candidate.checkpoints.map((item) => item.phase === 'verify'
      ? { ...item, actorId: 'actor-builder' }
      : item);

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('Builder cannot self-certify as Verifier');
  });

  it('blocks on a real verifier failure instead of letting later green checks average it away', () => {
    const candidate = input();
    candidate.checkpoints = candidate.checkpoints.map((item) => item.phase === 'verify'
      ? { ...item, verdict: 'FAILED' as const }
      : item);

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('BLOCKED');
    expect(result.currentPhase).toBe('verify');
  });

  it('invalidates the merge lane when main moved after proof', () => {
    const result = evaluateGoalfixExecution(input({ currentMainSha: 'd'.repeat(40) }));
    expect(result.state).toBe('REVERIFY_REQUIRED');
    expect(result.mayMerge).toBe(false);
  });

  it('requires founder authority after Builder, Verifier, and Red Team pass', () => {
    const result = evaluateGoalfixExecution(input());
    expect(result.state).toBe('READY_FOR_FOUNDER_MERGE_DECISION');
    expect(result.mayMerge).toBe(false);
  });

  it('rejects founder approval bound to a stale head', () => {
    const result = evaluateGoalfixExecution(input({
      founderDecision: {
        decisionId: 'decision-merge-001',
        action: 'MERGE',
        approvedBy: 'founder',
        approvedHeadSha: 'e'.repeat(40),
        approvedDiffFingerprint: DIFF,
        approvedAt: '2026-08-26T11:30:00.000Z',
        proofBinding: proofBinding(founderCookie),
      },
    }));

    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('founder decision head SHA is stale or mismatched');
  });

  it('opens merge only for exact-head, exact-diff founder authority', () => {
    const result = evaluateGoalfixExecution(input({
      founderDecision: {
        decisionId: 'decision-merge-002',
        action: 'MERGE',
        approvedBy: 'founder',
        approvedHeadSha: HEAD,
        approvedDiffFingerprint: DIFF,
        approvedAt: '2026-08-26T11:30:00.000Z',
        proofBinding: proofBinding(founderCookie),
      },
    }));

    expect(result.state).toBe('READY_TO_MERGE');
    expect(result.mayMerge).toBe(true);
  });

  it('keeps a merge unverified until required runtime proof exists', () => {
    const result = evaluateGoalfixExecution(input({
      founderDecision: {
        decisionId: 'decision-merge-003',
        action: 'MERGE',
        approvedBy: 'founder',
        approvedHeadSha: HEAD,
        approvedDiffFingerprint: DIFF,
        approvedAt: '2026-08-26T11:30:00.000Z',
        proofBinding: proofBinding(founderCookie),
      },
      postMergeTruth: {
        mergedSha: MERGED,
        currentMainSha: MERGED,
        runtimeProofRequired: true,
        runtimeReceiptIds: [],
        runtimeVerdict: 'UNVERIFIED',
        observedAt: '2026-08-26T11:50:00.000Z',
        proofBinding: proofBinding(providerCookie, MERGED),
      },
    }));

    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.mayMerge).toBe(false);
  });

  it('completes only after post-merge main/runtime truth is current', () => {
    const result = evaluateGoalfixExecution(input({
      founderDecision: {
        decisionId: 'decision-merge-004',
        action: 'MERGE',
        approvedBy: 'founder',
        approvedHeadSha: HEAD,
        approvedDiffFingerprint: DIFF,
        approvedAt: '2026-08-26T11:30:00.000Z',
        proofBinding: proofBinding(founderCookie),
      },
      postMergeTruth: {
        mergedSha: MERGED,
        currentMainSha: MERGED,
        runtimeProofRequired: true,
        runtimeReceiptIds: ['runtime-receipt-001'],
        runtimeVerdict: 'PASS',
        observedAt: '2026-08-26T11:50:00.000Z',
        proofBinding: proofBinding(providerCookie, MERGED),
      },
    }));

    expect(result.state).toBe('COMPLETE');
    expect(result.currentPhase).toBe('complete');
  });

  it('invalidates expired proof-cookie provenance even when the checkpoint says PASS', () => {
    const expiredVerifier = cookie('cookie_verify_expired1', 'verification-run', founderCookie.cookieId, {
      expiresAt: '2026-08-26T11:59:59.000Z',
    });
    const candidate = input();
    candidate.cookieIndex = new Map([...candidate.cookieIndex, [expiredVerifier.cookieId, expiredVerifier]]);
    candidate.checkpoints = candidate.checkpoints.map((item) => item.phase === 'verify'
      ? checkpoint('verify', 'verifier', 'actor-verifier', expiredVerifier)
      : item);

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons.some((reason) => reason.includes('proof cookie is expired'))).toBe(true);
  });
});
