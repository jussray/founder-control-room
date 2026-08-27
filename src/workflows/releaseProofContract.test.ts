import { describe, expect, it } from 'vitest';

import {
  bindReleaseProofCandidate,
  buildReleaseProofReceipt,
  evaluateFounderApprovalObservation,
  evaluateReleaseEvidence,
  fingerprintReleaseCandidate,
  normalizeReleaseProofCandidate,
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
      evidenceFingerprint: EVIDENCE_FINGERPRINT,
      verdict: 'clear',
    });

    expect(decision).toEqual({ state: 'BLOCKED', reason: 'EVIDENCE_IDENTITY_MISMATCH' });
  });

  it('preserves an explicit evidence blocker even when identity matches', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const decision = evaluateReleaseEvidence(bound, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      evidenceFingerprint: EVIDENCE_FINGERPRINT,
      verdict: 'blocked',
    });

    expect(decision).toEqual({ state: 'BLOCKED', reason: 'EVIDENCE_REPORTED_BLOCKER' });
  });

  it('correlates founder approval observation without converting it into execution authority', () => {
    const bound = bindReleaseProofCandidate(candidateInput);
    const evidence = evaluateReleaseEvidence(bound, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      evidenceFingerprint: EVIDENCE_FINGERPRINT,
      verdict: 'clear',
    });
    const founder = evaluateFounderApprovalObservation(bound, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: true,
    });

    expect(evidence.state).toBe('EVIDENCE_CLEAR');
    expect(founder.state).toBe('FOUNDER_APPROVAL_OBSERVED');

    if (evidence.state !== 'EVIDENCE_CLEAR' || founder.state !== 'FOUNDER_APPROVAL_OBSERVED') {
      throw new Error('Test setup failed to reach correlated observations.');
    }

    expect(buildReleaseProofReceipt(bound, evidence, founder)).toMatchObject({
      state: 'READY_FOR_FINAL_REREAD',
      repository: 'jussray/founder-control-room',
      targetBranch: 'main',
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      pullRequestNumber: 720,
      founderApprovalObserved: true,
      mergeAuthorized: false,
      deploymentAuthorized: false,
      providerMutationAuthorized: false,
      nextGate: 'FINAL_PROVIDER_REREAD_AND_EXISTING_AUTHORITY_CONTRACT_REQUIRED',
    });
  });

  it('holds when founder approval is absent or correlated to another candidate', () => {
    const bound = bindReleaseProofCandidate(candidateInput);

    expect(evaluateFounderApprovalObservation(bound, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: bound.candidateFingerprint,
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: false,
    })).toEqual({ state: 'HOLD', reason: 'FOUNDER_APPROVAL_NOT_OBSERVED' });

    expect(evaluateFounderApprovalObservation(bound, {
      repository: bound.candidate.repository,
      headSha: bound.candidate.headSha,
      candidateFingerprint: 'c'.repeat(64),
      authorityReceiptFingerprint: AUTHORITY_FINGERPRINT,
      approved: true,
    })).toEqual({ state: 'HOLD', reason: 'FOUNDER_IDENTITY_MISMATCH' });
  });
});
