import { describe, expect, it } from 'vitest';
import {
  evaluateGoalfixExecution,
  goalfixDiffFingerprint,
  goalfixSourceFingerprint,
  type GoalfixExecutionCheckpoint,
  type GoalfixExecutionInput,
} from './executionWorkflow.js';
import type { ProofBinding, ProofCookieContract } from '../security/attack20V3.js';

const REPOSITORY = 'jussray/founder-control-room';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const MERGED = 'c'.repeat(40);
const DIFF = goalfixDiffFingerprint({ base: BASE, head: HEAD, scope: 'goalfix-v2' });
const NOW = new Date('2026-08-26T12:00:00.000Z');

function cookie(id: string, contextType: ProofCookieContract['contextType'], parentCookieId: string | null = null): ProofCookieContract {
  return {
    cookieId: id,
    contextType,
    owner: `principal:${contextType}`,
    createdAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-27T10:00:00.000Z',
    parentCookieId,
    revokedAt: null,
  };
}

const founder = cookie('cookie_founder_red001', 'founder-session');
const builder = cookie('cookie_builder_red001', 'builder-run', founder.cookieId);
const verifier = cookie('cookie_verify_red0001', 'verification-run', founder.cookieId);
const redteam = cookie('cookie_redteam_red001', 'verification-run', founder.cookieId);
const provider = cookie('cookie_provider_red01', 'provider-run', founder.cookieId);

function binding(proofCookie: ProofCookieContract, headSha = HEAD): ProofBinding {
  return {
    fingerprints: {
      sourceSha: goalfixSourceFingerprint(REPOSITORY, headSha),
    },
    cookieContract: proofCookie,
  };
}

function checkpoint(
  phase: GoalfixExecutionCheckpoint['phase'],
  role: GoalfixExecutionCheckpoint['role'],
  actorId: string,
  proofCookie: ProofCookieContract,
): GoalfixExecutionCheckpoint {
  return {
    phase,
    role,
    actorId,
    verdict: 'PASS',
    repository: REPOSITORY,
    baseSha: BASE,
    headSha: HEAD,
    diffFingerprint: DIFF,
    evidenceIds: [`evidence:${phase}`],
    observedAt: '2026-08-26T11:00:00.000Z',
    proofBinding: binding(proofCookie),
  };
}

function validInput(): GoalfixExecutionInput {
  return {
    repository: REPOSITORY,
    branch: 'feat/focused-fix',
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
      checkpoint('observe', 'system', 'observer', builder),
      checkpoint('orient', 'system', 'orienter', builder),
      checkpoint('decide', 'founder', 'founder', founder),
      checkpoint('builder', 'builder', 'builder', builder),
      checkpoint('verify', 'verifier', 'verifier', verifier),
      checkpoint('redteam', 'redteam', 'redteam', redteam),
    ],
    cookieIndex: new Map([
      [founder.cookieId, founder],
      [builder.cookieId, builder],
      [verifier.cookieId, verifier],
      [redteam.cookieId, redteam],
      [provider.cookieId, provider],
    ]),
    founderDecision: {
      decisionId: 'decision-redteam-001',
      action: 'MERGE',
      approvedBy: 'founder',
      approvedHeadSha: HEAD,
      approvedDiffFingerprint: DIFF,
      approvedAt: '2026-08-26T11:30:00.000Z',
      proofBinding: binding(founder),
    },
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
    candidate.postMergeTruth = {
      mergedSha: MERGED,
      currentMainSha: MERGED,
      runtimeProofRequired: true,
      runtimeReceiptIds: ['runtime-receipt-red001'],
      runtimeVerdict: 'PASS',
      observedAt: '2026-08-26T11:50:00.000Z',
      proofBinding: binding(provider, HEAD),
    };

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('post-merge sourceSha proof fingerprint does not match merged/current-main SHA');
  });
});
