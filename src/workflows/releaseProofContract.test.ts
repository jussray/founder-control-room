import { describe, expect, it } from 'vitest';

import {
  ATTACK_1000_PRESSURE_BUDGET,
  RELEASE_PROOF_CONTINUITY_SCHEMA,
  bindReleaseProofCandidate,
  buildAuthorityContinuityCookie,
  buildCandidateContinuityCookie,
  buildEvidenceContinuityCookie,
  buildReleaseProofReceipt,
  evaluateFounderApprovalObservation,
  evaluateReleaseEvidence,
  fingerprintReleaseCandidate,
  normalizeReleaseProofCandidate,
  type EvidenceDecision,
} from './releaseProofContract.js';

const BASE_SHA = '1'.repeat(40);
const HEAD_SHA = '2'.repeat(40);
const EVIDENCE_FINGERPRINT = 'a'.repeat(64);
const AUTHORITY_FINGERPRINT = 'b'.repeat(64);

const candidateInput = {
  repository: 'jussray/founder-control-room',
  targetBranch: 'main',
  baseSha: BASE_SHA.toUpperCase(),
  headSha: HEAD_SHA.toUpperCase(),
  pullRequestNumber: 720,
};

function clearEvidence(
  bound: ReturnType<typeof bindReleaseProofCandidate>,
  overrides: Record<string, unknown> = {},
) {
  return evaluateReleaseEvidence(bound, {
    repository: bound.candidate.repository,
    headSha: bound.candidate.headSha,
    candidateFingerprint: bound.candidateFingerprint,
    candidateCookie: bound.candidateCookie,
    evidenceFingerprint: EVIDENCE_FINGERPRINT,
    verdict: 'clear',
    ...overrides,
  });
}

function requireClear(evidence: EvidenceDecision) {
  if (evidence.state !== 'EVIDENCE_CLEAR') {
    throw new Error(`Test setup failed to reach clear evidence: ${evidence.reason}`);
  }
  return evidence;
}

describe('ReleaseProofWorkflowV0 contract', () => {
  it('normalizes exact release identity and fingerprints it deterministically', () => {
    const candidate = normalizeReleaseProofCandidate(candidateInput);

    expect(candidate).toEqual({
      ...candidateInput,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
    });
    expect(fingerprintReleaseCandidate(candidate)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintReleaseCandidate(candidate)).toBe(fingerprintReleaseCandidate({ ...candidate }));
  });

  it('binds a deterministic continuity cookie to the exact candidate fingerprint', () => {
    const bound = bindReleaseProofCandidate(candidateInput);

    expect(bound.candidateCookie).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.candidateCookie).toBe(buildCandidateContinuityCookie(bound.candidateFingerprint));
    expect(RELEASE_PROOF_CONTINUITY_SCHEMA).toBe('fcr/release-proof-continuity@v1');
  });

  it('changes continuity when the exact candidate moves while preserving the historical fingerprint value', () => {
    const first = bindReleaseProofCandidate(candidateInput);
    const moved = bindReleaseProofCandidate({
      ...candidateInput,
      headSha: '3'.repeat(40),
    });

    expect(first.candidateFingerprint).not.toBe(moved.candidateFingerprint);
    expect(first.candidateCookie).not.toBe(moved.candidateCookie);
    expect(first.candidateFingerprint).toBe(fingerprintReleaseCandidate(first.candidate));
  });

  it('rejects malformed release identities before orchestration begins', () => {
    expect(() => normalizeReleaseProofCandidate({
      ...candidateInput,
      headSha: 'short',
    })).toThrow(/40-character Git SHAs/);

    expect(() => normalizeReleaseProofCandidate({
      ...candidateInput,
      pullRequestNumber: 0,
    })).toThrow(/positive integer/);
  });

  it('fails closed when evidence is bound to another candidate', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const decision = evaluateReleaseEvidence(bound, {
      repository: bound.candidate.repository,
      headSha: '3'.repeat(40),
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: EVIDENCE_FINGERPRINT,
      verdict: 'clear',
    });

    expect(decision).toEqual({ state: 'BLOCKED', reason: 'EVIDENCE_IDENTITY_MISMATCH' });
  });

  it('rejects stale candidate-cookie replay even when candidate fields look current', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const decision = clearEvidence(bound, {
      candidateCookie: 'c'.repeat(64),
    });

    expect(decision).toEqual({ state: 'BLOCKED', reason: 'EVIDENCE_COOKIE_MISMATCH' });
  });

  it('preserves an explicit evidence blocker even when identity and cookie match', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const decision = evaluateReleaseEvidence(bound, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: EVIDENCE_FINGERPRINT,
      verdict: 'blocked',
    });

    expect(decision).toEqual({ state: 'BLOCKED', reason: 'EVIDENCE_REPORTED_BLOCKER' });
  });

  it('chains evidence continuity to candidate continuity plus the evidence fingerprint', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const evidence = requireClear(clearEvidence(bound));

    expect(evidence.evidenceCookie).toBe(
      buildEvidenceContinuityCookie(bound.candidateCookie, EVIDENCE_FINGERPRINT),
    );
    expect(evidence.evidenceCookie).toMatch(/^[0-9a-f]{64}$/);
  });

  it('correlates founder approval to the exact evidence cookie without converting it into execution authority', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const evidence = requireClear(clearEvidence(bound));
    const founder = evaluateFounderApprovalObservation(bound, evidence, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: evidence.evidenceFingerprint,
      evidenceCookie: evidence.evidenceCookie,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: true,
    });

    expect(founder.state).toBe('FOUNDER_APPROVAL_OBSERVED');

    if (founder.state !== 'FOUNDER_APPROVAL_OBSERVED') {
      throw new Error('Test setup failed to reach correlated founder observation.');
    }

    expect(founder.authorityCookie).toBe(
      buildAuthorityContinuityCookie(evidence.evidenceCookie, AUTHORITY_FINGERPRINT),
    );

    expect(buildReleaseProofReceipt(bound, evidence, founder)).toMatchObject({
      continuitySchema: 'fcr/release-proof-continuity@v1',
      state: 'READY_FOR_FINAL_REREAD',
      repository: 'jussray/founder-control-room',
      targetBranch: 'main',
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      pullRequestNumber: 720,
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: evidence.evidenceFingerprint,
      evidenceCookie: evidence.evidenceCookie,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      authorityCookie: founder.authorityCookie,
      founderApprovalObserved: true,
      mergeAuthorized: false,
      deploymentAuthorized: false,
      providerMutationAuthorized: false,
      attack1000: {
        pressureBudget: ATTACK_1000_PRESSURE_BUDGET,
        literalExternalActionsClaimed: 0,
      },
      invariants: {
        historicalFingerprintIsImmutable: true,
        candidateMovementExpiresContinuity: true,
        evidenceCannotCrossCandidateCookie: true,
        authorityCannotCrossEvidenceCookie: true,
        receiptDoesNotSelfAuthorize: true,
      },
      nextGate: 'FINAL_PROVIDER_REREAD_AND_EXISTING_AUTHORITY_CONTRACT_REQUIRED',
    });
  });

  it('rejects founder approval replayed from another evidence packet', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const evidence = requireClear(clearEvidence(bound));

    expect(evaluateFounderApprovalObservation(bound, evidence, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: evidence.evidenceFingerprint,
      evidenceCookie: 'd'.repeat(64),
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: true,
    })).toEqual({ state: 'HOLD', reason: 'FOUNDER_EVIDENCE_MISMATCH' });
  });

  it('rejects founder approval replayed with a predecessor candidate cookie', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const evidence = requireClear(clearEvidence(bound));

    expect(evaluateFounderApprovalObservation(bound, evidence, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: 'e'.repeat(64),
      evidenceFingerprint: evidence.evidenceFingerprint,
      evidenceCookie: evidence.evidenceCookie,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: true,
    })).toEqual({ state: 'HOLD', reason: 'FOUNDER_COOKIE_MISMATCH' });
  });

  it('holds when founder approval is absent or correlated to another candidate', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const evidence = requireClear(clearEvidence(bound));

    expect(evaluateFounderApprovalObservation(bound, evidence, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: evidence.evidenceFingerprint,
      evidenceCookie: evidence.evidenceCookie,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: false,
    })).toEqual({ state: 'HOLD', reason: 'FOUNDER_APPROVAL_NOT_OBSERVED' });

    expect(evaluateFounderApprovalObservation(bound, evidence, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: 'c'.repeat(64),
      candidateCookie: bound.candidateCookie,
      evidenceFingerprint: evidence.evidenceFingerprint,
      evidenceCookie: evidence.evidenceCookie,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: true,
    })).toEqual({ state: 'HOLD', reason: 'FOUNDER_IDENTITY_MISMATCH' });
  });
});
