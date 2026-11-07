import { describe, expect, it } from 'vitest';
import {
  GOALFIX_MERGE_PROOF_TTL_MS,
  GOALFIX_RUNTIME_PROOF_TTL_MS,
  evaluateGoalfixExecution,
  goalfixCheckpointEvidenceFingerprint,
  goalfixDiffFingerprint,
  goalfixFounderDecisionFingerprint,
  goalfixMergeAncestryFingerprint,
  goalfixRuntimeReceiptFingerprint,
  goalfixSourceFingerprint,
  type GoalfixExecutionCheckpoint,
  type GoalfixExecutionInput,
  type GoalfixExecutionPhase,
  type GoalfixExecutionRole,
  type GoalfixFounderDecision,
  type GoalfixMergeAncestryReceipt,
  type GoalfixPostMergeTruth,
  type GoalfixRuntimeReceipt,
} from './executionWorkflow.js';
import { fingerprintNormalized, type ProofCookieContract } from '../security/attack20V3.js';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const MERGED = 'c'.repeat(40);
const REPOSITORY = 'jussray/founder-control-room';
const PR_NUMBER = 711;
const SOURCE_BRANCH = 'feat/focused-fix';
const TARGET_BRANCH = 'main';
const FOUNDER_PRINCIPAL = 'principal:founder';
const NOW = new Date('2026-08-26T12:00:00.000Z');
const DIFF = goalfixDiffFingerprint({ files: ['src/goalfix/executionWorkflow.ts'], base: BASE, head: HEAD });
const RUNTIME_FINGERPRINT = fingerprintNormalized({ mergedSha: MERGED, runtime: 'observed' });

function cookie(
  cookieId: string,
  contextType: ProofCookieContract['contextType'],
  parentCookieId: string | null = null,
  overrides: Partial<ProofCookieContract> = {},
): ProofCookieContract {
  return {
    cookieId,
    contextType,
    owner: contextType === 'founder-session' ? FOUNDER_PRINCIPAL : `principal:${contextType}`,
    createdAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-27T10:00:00.000Z',
    parentCookieId,
    revokedAt: null,
    ...overrides,
  };
}

const founderCookie = cookie('cookie_founder_000001', 'founder-session');
const builderCookie = cookie('cookie_builder_000001', 'builder-run', founderCookie.cookieId, { owner: 'actor-builder' });
const verifierCookie = cookie('cookie_verify_000001', 'verification-run', builderCookie.cookieId, { owner: 'actor-verifier' });
const redteamCookie = cookie('cookie_redteam_000001', 'verification-run', builderCookie.cookieId, { owner: 'actor-redteam' });
const providerCookie = cookie('cookie_provider_00001', 'provider-run', verifierCookie.cookieId, { owner: 'actor-provider' });

function checkpoint(
  phase: GoalfixExecutionPhase,
  role: GoalfixExecutionRole,
  actorId: string,
  proofCookie: ProofCookieContract,
  verdict: GoalfixExecutionCheckpoint['verdict'] = 'PASS',
  overrides: Partial<GoalfixExecutionCheckpoint> = {},
): GoalfixExecutionCheckpoint {
  const candidate: GoalfixExecutionCheckpoint = {
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
    proofBinding: { fingerprints: {}, cookieContract: proofCookie },
    ...overrides,
  };
  candidate.proofBinding = {
    fingerprints: {
      sourceSha: goalfixSourceFingerprint(candidate.repository, candidate.headSha),
      evidenceBundle: goalfixCheckpointEvidenceFingerprint(candidate),
    },
    cookieContract: proofCookie,
  };
  return candidate;
}

function checkpoints(): GoalfixExecutionCheckpoint[] {
  return [
    checkpoint('observe', 'system', 'actor-observer', builderCookie, 'PASS', { observedAt: '2026-08-26T10:40:00.000Z' }),
    checkpoint('orient', 'system', 'actor-orient', builderCookie, 'PASS', { observedAt: '2026-08-26T10:45:00.000Z' }),
    checkpoint('decide', 'founder', 'actor-founder', founderCookie, 'PASS', { observedAt: '2026-08-26T10:50:00.000Z' }),
    checkpoint('builder', 'builder', 'actor-builder', builderCookie, 'PASS', { observedAt: '2026-08-26T11:00:00.000Z' }),
    checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'PASS', { observedAt: '2026-08-26T11:10:00.000Z' }),
    checkpoint('redteam', 'redteam', 'actor-redteam', redteamCookie, 'PASS', { observedAt: '2026-08-26T11:20:00.000Z' }),
  ];
}

function cookieIndex() {
  return new Map([
    [founderCookie.cookieId, founderCookie],
    [builderCookie.cookieId, builderCookie],
    [verifierCookie.cookieId, verifierCookie],
    [redteamCookie.cookieId, redteamCookie],
    [providerCookie.cookieId, providerCookie],
  ]);
}

function founderDecision(overrides: Partial<GoalfixFounderDecision> = {}): GoalfixFounderDecision {
  const base: Omit<GoalfixFounderDecision, 'proofBinding'> = {
    decisionId: 'decision-merge-001',
    action: 'MERGE',
    approvedBy: FOUNDER_PRINCIPAL,
    pullRequestNumber: PR_NUMBER,
    sourceBranch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    approvedBaseSha: BASE,
    approvedHeadSha: HEAD,
    approvedDiffFingerprint: DIFF,
    approvedAt: '2026-08-26T11:50:00.000Z',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'proofBinding')),
  } as Omit<GoalfixFounderDecision, 'proofBinding'>;
  return {
    ...base,
    proofBinding: overrides.proofBinding ?? {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, base.approvedHeadSha),
        evidenceBundle: goalfixFounderDecisionFingerprint(base, REPOSITORY),
      },
      cookieContract: founderCookie,
    },
  };
}

function ancestryReceipt(overrides: Partial<GoalfixMergeAncestryReceipt> = {}): GoalfixMergeAncestryReceipt {
  const base: Omit<GoalfixMergeAncestryReceipt, 'proofBinding'> = {
    receiptId: 'merge-ancestry-0001',
    repository: REPOSITORY,
    pullRequestNumber: PR_NUMBER,
    sourceBranch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    candidateHeadSha: HEAD,
    candidateDiffFingerprint: DIFF,
    mergedSha: MERGED,
    currentMainSha: MERGED,
    containsCandidate: true,
    mergedAt: '2026-08-26T11:52:00.000Z',
    observedAt: '2026-08-26T11:53:00.000Z',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'proofBinding')),
  } as Omit<GoalfixMergeAncestryReceipt, 'proofBinding'>;
  return {
    ...base,
    proofBinding: overrides.proofBinding ?? {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, base.mergedSha),
        evidenceBundle: goalfixMergeAncestryFingerprint(base),
      },
      cookieContract: providerCookie,
    },
  };
}

function runtimeReceipt(overrides: Partial<GoalfixRuntimeReceipt> = {}): GoalfixRuntimeReceipt {
  const base: Omit<GoalfixRuntimeReceipt, 'proofBinding'> = {
    receiptId: 'runtime-receipt-001',
    mergedSha: MERGED,
    verdict: 'PASS',
    observedAt: '2026-08-26T11:54:00.000Z',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'proofBinding')),
  } as Omit<GoalfixRuntimeReceipt, 'proofBinding'>;
  return {
    ...base,
    proofBinding: overrides.proofBinding ?? {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, base.mergedSha),
        runtime: RUNTIME_FINGERPRINT,
        evidenceBundle: goalfixRuntimeReceiptFingerprint(base),
      },
      cookieContract: providerCookie,
    },
  };
}

function postMergeTruth(overrides: Partial<GoalfixPostMergeTruth> = {}): GoalfixPostMergeTruth {
  const runtime = runtimeReceipt();
  return {
    mergedSha: MERGED,
    currentMainSha: MERGED,
    runtimeProofRequired: true,
    runtimeReceiptIds: [runtime.receiptId],
    runtimeReceipts: [runtime],
    mergeAncestryReceipt: ancestryReceipt(),
    observedAt: '2026-08-26T11:55:00.000Z',
    proofBinding: {
      fingerprints: {
        sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED),
        runtime: RUNTIME_FINGERPRINT,
      },
      cookieContract: providerCookie,
    },
    ...overrides,
  };
}

function freshPostMergeTruth(): GoalfixPostMergeTruth {
  const runtime = runtimeReceipt({ observedAt: '2026-08-26T12:25:00.000Z' });
  return postMergeTruth({
    runtimeReceiptIds: [runtime.receiptId],
    runtimeReceipts: [runtime],
    observedAt: '2026-08-26T12:26:00.000Z',
  });
}

function input(overrides: Partial<GoalfixExecutionInput> = {}): GoalfixExecutionInput {
  return {
    repository: REPOSITORY,
    pullRequestNumber: PR_NUMBER,
    branch: SOURCE_BRANCH,
    targetBranch: TARGET_BRANCH,
    trustedFounderPrincipalId: FOUNDER_PRINCIPAL,
    trustedRuntimeFingerprint: RUNTIME_FINGERPRINT,
    baseSha: BASE,
    candidateHeadSha: HEAD,
    currentMainSha: overrides.postMergeTruth?.currentMainSha ?? BASE,
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
    cookieIndex: cookieIndex(),
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
    expect(evaluateGoalfixExecution(candidate).state).toBe('BLOCKED_PRECONDITION');
  });

  it('rejects caller actor labels that do not match authenticated proof ownership', () => {
    const candidate = input();
    candidate.checkpoints = candidate.checkpoints.map((item) => item.phase === 'verify'
      ? { ...item, actorId: 'actor-builder' }
      : item);
    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('verify: actorId must match the authenticated proof-cookie owner');
  });

  it('rejects a self-declared checkpoint leaf owner even when the caller actor label matches it', () => {
    const candidate = input();
    const forgedVerifier = { ...verifierCookie, owner: 'actor-forged' };
    candidate.checkpoints = candidate.checkpoints.map((item) => item.phase === 'verify'
      ? checkpoint('verify', 'verifier', 'actor-forged', forgedVerifier, 'PASS', { observedAt: item.observedAt })
      : item);
    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain(
      `verify: proof cookie ${verifierCookie.cookieId} does not match authenticated cookie index`,
    );
  });

  it('requires every checkpoint to bind non-empty evidence to the exact diff', () => {
    const candidate = input();
    const broken = checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'PASS', { evidenceIds: [] });
    candidate.checkpoints = candidate.checkpoints.map((item) => item.phase === 'verify' ? broken : item);
    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('verify: at least one unique evidence ID is required');
  });

  it('lets a later successful retry supersede the historical failure', () => {
    const candidate = input();
    const oldFailure = checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'FAILED', { observedAt: '2026-08-26T11:05:00.000Z' });
    const retry = checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'PASS', { observedAt: '2026-08-26T11:15:00.000Z', evidenceIds: ['evidence:verify:retry'] });
    candidate.checkpoints = [...candidate.checkpoints, oldFailure, retry];
    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('READY_FOR_FOUNDER_MERGE_DECISION');
  });

  it('rejects a future-dated retry before it can supersede a current failure', () => {
    const candidate = input();
    const failed = checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'FAILED', { observedAt: '2026-08-26T11:15:00.000Z' });
    const futurePass = checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'PASS', { observedAt: '2026-08-26T12:00:01.000Z', evidenceIds: ['evidence:verify:future'] });
    candidate.checkpoints = [...candidate.checkpoints, failed, futurePass];
    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('verify: observedAt cannot be in the future');
  });

  it('blocks on the current verifier failure instead of letting later green checks average it away', () => {
    const candidate = input();
    const failed = checkpoint('verify', 'verifier', 'actor-verifier', verifierCookie, 'FAILED', { observedAt: '2026-08-26T11:15:00.000Z' });
    candidate.checkpoints = [...candidate.checkpoints, failed];
    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('BLOCKED');
    expect(result.currentPhase).toBe('verify');
  });

  it('invalidates the pre-merge lane when main moved after proof', () => {
    const result = evaluateGoalfixExecution(input({ currentMainSha: 'd'.repeat(40) }));
    expect(result.state).toBe('REVERIFY_REQUIRED');
  });

  it('requires authenticated founder authority after Builder, Verifier, and Red Team pass', () => {
    const result = evaluateGoalfixExecution(input());
    expect(result.state).toBe('READY_FOR_FOUNDER_MERGE_DECISION');
  });

  it('rejects founder approval bound to stale head, wrong PR, or untrusted identity', () => {
    const stale = evaluateGoalfixExecution(input({ founderDecision: founderDecision({ approvedHeadSha: 'e'.repeat(40) }) }));
    expect(stale.reasons).toContain('founder decision head SHA is stale or mismatched');

    const wrongPr = evaluateGoalfixExecution(input({ founderDecision: founderDecision({ pullRequestNumber: 999 }) }));
    expect(wrongPr.reasons).toContain('founder decision PR number is stale or mismatched');

    const wrongIdentity = evaluateGoalfixExecution(input({ founderDecision: founderDecision({ approvedBy: 'principal:other' }) }));
    expect(wrongIdentity.reasons).toContain('founder decision identity is not the trusted authenticated founder principal');
  });

  it('rejects Founder Final that predates the latest load-bearing proof lane', () => {
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision({ approvedAt: '2026-08-26T11:15:00.000Z' }) }));
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons).toContain('founder decision must follow the latest load-bearing pre-merge checkpoint');
  });

  it('rejects future and stale founder approval outside the canonical 15-minute proof window before merge', () => {
    const future = evaluateGoalfixExecution(input({ founderDecision: founderDecision({ approvedAt: '2026-08-26T12:00:01.000Z' }) }));
    expect(future.reasons).toContain('founder decision approval cannot be in the future');

    const staleAt = new Date(NOW.getTime() - GOALFIX_MERGE_PROOF_TTL_MS - 1).toISOString();
    const stale = evaluateGoalfixExecution(input({ founderDecision: founderDecision({ approvedAt: staleAt }) }));
    expect(stale.reasons).toContain('founder decision approval is outside the merge proof freshness window');
  });

  it('opens merge only for exact PR/base/head/branches/diff authenticated founder authority', () => {
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision() }));
    expect(result.state).toBe('READY_TO_MERGE');
    expect(result.mayMerge).toBe(true);
  });

  it('accepts honest lifecycle movement when observed current main equals the provider-bound merged main', () => {
    const truth = postMergeTruth();
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('COMPLETE');
  });

  it('rejects post-merge truth when provider current main disagrees with the observed current main', () => {
    const truth = postMergeTruth();
    const result = evaluateGoalfixExecution(input({
      founderDecision: founderDecision(),
      postMergeTruth: truth,
      currentMainSha: 'd'.repeat(40),
    }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('post-merge provider current main does not match observed current main');
  });

  it('keeps a merge unverified when ancestry does not prove the approved candidate landed', () => {
    const truth = postMergeTruth({ mergeAncestryReceipt: ancestryReceipt({ containsCandidate: false }) });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('merge ancestry does not prove merged main contains the approved candidate');
  });

  it('requires provider-run provenance for merge ancestry proof', () => {
    const badAncestry = ancestryReceipt();
    badAncestry.proofBinding = { ...badAncestry.proofBinding, cookieContract: verifierCookie };
    const truth = postMergeTruth({ mergeAncestryReceipt: badAncestry });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('merge ancestry proof cookie context must be provider-run');
  });

  it('rejects provider merge time that predates Founder Final authorization', () => {
    const truth = postMergeTruth({
      mergeAncestryReceipt: ancestryReceipt({ mergedAt: '2026-08-26T11:40:00.000Z' }),
    });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('merge ancestry provider merge time predates Founder Final authorization');
  });

  it('keeps a merge unverified until runtime receipt IDs resolve to loaded PASS receipts', () => {
    const truth = postMergeTruth({ runtimeReceiptIds: ['runtime-receipt-missing'], runtimeReceipts: [] });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('runtime receipt IDs must resolve to the loaded runtime receipt set');
  });

  it('binds every runtime PASS receipt to the trusted authenticated provider witness', () => {
    const forgedRuntime = runtimeReceipt();
    forgedRuntime.proofBinding = {
      ...forgedRuntime.proofBinding,
      fingerprints: {
        ...forgedRuntime.proofBinding.fingerprints,
        runtime: fingerprintNormalized({ mergedSha: MERGED, runtime: 'forged' }),
      },
    };
    const truth = postMergeTruth({
      runtimeReceiptIds: [forgedRuntime.receiptId],
      runtimeReceipts: [forgedRuntime],
    });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain(
      `${forgedRuntime.receiptId}: runtime receipt fingerprint does not match trusted provider runtime witness`,
    );
  });

  it('rejects a forged post-merge runtime value even when every caller-controlled payload agrees with it', () => {
    const forgedFingerprint = fingerprintNormalized({ mergedSha: MERGED, runtime: 'forged-everywhere' });
    const forgedRuntime = runtimeReceipt();
    forgedRuntime.proofBinding = {
      ...forgedRuntime.proofBinding,
      fingerprints: { ...forgedRuntime.proofBinding.fingerprints, runtime: forgedFingerprint },
    };
    const truth = postMergeTruth({
      runtimeReceiptIds: [forgedRuntime.receiptId],
      runtimeReceipts: [forgedRuntime],
      proofBinding: {
        fingerprints: {
          sourceSha: goalfixSourceFingerprint(REPOSITORY, MERGED),
          runtime: forgedFingerprint,
        },
        cookieContract: providerCookie,
      },
    });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('post-merge runtime fingerprint does not match trusted provider runtime witness');
    expect(result.reasons).toContain(
      `${forgedRuntime.receiptId}: runtime receipt fingerprint does not match trusted provider runtime witness`,
    );
  });

  it('expires an old runtime PASS even when its cookie remains valid', () => {
    const staleRuntime = runtimeReceipt({
      observedAt: new Date(NOW.getTime() - GOALFIX_RUNTIME_PROOF_TTL_MS - 1).toISOString(),
    });
    const truth = postMergeTruth({
      runtimeReceiptIds: [staleRuntime.receiptId],
      runtimeReceipts: [staleRuntime],
    });
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain(
      `${staleRuntime.receiptId}: runtime receipt is outside the runtime proof freshness window`,
    );
  });

  it('fails closed when a caller attempts to disable post-merge runtime proof', () => {
    const truth = postMergeTruth();
    (truth as unknown as { runtimeProofRequired: boolean }).runtimeProofRequired = false;
    truth.runtimeReceiptIds = [];
    truth.runtimeReceipts = [];
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: truth }));
    expect(result.state).toBe('MERGED_UNVERIFIED');
    expect(result.reasons).toContain('post-merge runtime proof cannot be caller-disabled');
    expect(result.reasons).toContain('post-merge runtime proof is required but no runtime receipt exists');
  });

  it('does not reapply pre-merge authority TTL after provider-bound merge execution is proven', () => {
    const result = evaluateGoalfixExecution(input({
      founderDecision: founderDecision(),
      postMergeTruth: freshPostMergeTruth(),
      now: new Date('2026-08-26T12:30:00.000Z'),
    }));
    expect(result.state).toBe('COMPLETE');
  });

  it('fails closed when consumed pre-merge proof expires before the provider merge boundary', () => {
    const historicalBuilder = cookie('cookie_builder_history1', 'builder-run', founderCookie.cookieId, {
      owner: 'actor-builder',
      expiresAt: '2026-08-26T11:51:00.000Z',
    });
    const historicalVerifier = cookie('cookie_verify_history01', 'verification-run', historicalBuilder.cookieId, {
      owner: 'actor-verifier',
      expiresAt: '2026-08-26T11:51:00.000Z',
    });
    const historicalRedteam = cookie('cookie_redteam_history1', 'verification-run', historicalBuilder.cookieId, {
      owner: 'actor-redteam',
      expiresAt: '2026-08-26T11:51:00.000Z',
    });
    const candidate = input({
      founderDecision: founderDecision(),
      postMergeTruth: freshPostMergeTruth(),
      now: new Date('2026-08-26T12:30:00.000Z'),
    });
    candidate.cookieIndex = new Map([
      ...candidate.cookieIndex,
      [historicalBuilder.cookieId, historicalBuilder],
      [historicalVerifier.cookieId, historicalVerifier],
      [historicalRedteam.cookieId, historicalRedteam],
    ]);
    candidate.checkpoints = candidate.checkpoints.map((item) => {
      if (item.phase === 'builder') return checkpoint('builder', 'builder', 'actor-builder', historicalBuilder, 'PASS', { observedAt: '2026-08-26T11:00:00.000Z' });
      if (item.phase === 'verify') return checkpoint('verify', 'verifier', 'actor-verifier', historicalVerifier, 'PASS', { observedAt: '2026-08-26T11:10:00.000Z' });
      if (item.phase === 'redteam') return checkpoint('redteam', 'redteam', 'actor-redteam', historicalRedteam, 'PASS', { observedAt: '2026-08-26T11:20:00.000Z' });
      return item;
    });

    const result = evaluateGoalfixExecution(candidate);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.reasons.some((reason) => reason.includes('proof cookie is expired'))).toBe(true);
  });

  it('preserves consumed pre-merge proof that remains valid through provider merge as historical provenance', () => {
    const historicalBuilder = cookie('cookie_builder_history2', 'builder-run', founderCookie.cookieId, {
      owner: 'actor-builder',
      expiresAt: '2026-08-26T12:00:00.000Z',
    });
    const historicalVerifier = cookie('cookie_verify_history02', 'verification-run', historicalBuilder.cookieId, {
      owner: 'actor-verifier',
      expiresAt: '2026-08-26T12:00:00.000Z',
    });
    const historicalRedteam = cookie('cookie_redteam_history2', 'verification-run', historicalBuilder.cookieId, {
      owner: 'actor-redteam',
      expiresAt: '2026-08-26T12:00:00.000Z',
    });
    const candidate = input({
      founderDecision: founderDecision(),
      postMergeTruth: freshPostMergeTruth(),
      now: new Date('2026-08-26T12:30:00.000Z'),
    });
    candidate.cookieIndex = new Map([
      ...candidate.cookieIndex,
      [historicalBuilder.cookieId, historicalBuilder],
      [historicalVerifier.cookieId, historicalVerifier],
      [historicalRedteam.cookieId, historicalRedteam],
    ]);
    candidate.checkpoints = candidate.checkpoints.map((item) => {
      if (item.phase === 'builder') return checkpoint('builder', 'builder', 'actor-builder', historicalBuilder, 'PASS', { observedAt: '2026-08-26T11:00:00.000Z' });
      if (item.phase === 'verify') return checkpoint('verify', 'verifier', 'actor-verifier', historicalVerifier, 'PASS', { observedAt: '2026-08-26T11:10:00.000Z' });
      if (item.phase === 'redteam') return checkpoint('redteam', 'redteam', 'actor-redteam', historicalRedteam, 'PASS', { observedAt: '2026-08-26T11:20:00.000Z' });
      return item;
    });

    expect(evaluateGoalfixExecution(candidate).state).toBe('COMPLETE');
  });

  it('completes only after candidate ancestry and loaded post-merge runtime truth are current', () => {
    const result = evaluateGoalfixExecution(input({ founderDecision: founderDecision(), postMergeTruth: postMergeTruth() }));
    expect(result.state).toBe('COMPLETE');
    expect(result.currentPhase).toBe('complete');
  });

  it('invalidates expired proof-cookie provenance even when the checkpoint says PASS', () => {
    const expiredVerifier = cookie('cookie_verify_expired1', 'verification-run', builderCookie.cookieId, {
      owner: 'actor-verifier',
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