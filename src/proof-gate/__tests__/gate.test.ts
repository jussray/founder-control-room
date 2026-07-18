/**
 * Proof Gate unit tests.
 *
 * Run: npx vitest run src/proof-gate/__tests__/gate.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  runProofGate,
  assertProofPassed,
  requiresFounderApproval,
  ProofGateError,
  APPROVAL_GATES,
} from '../gate.js';
import type { ProofEvidence } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validEvidence: ProofEvidence = {
  filesChanged: ['src/api/auth.ts'],
  behaviorChanged: 'Added RLS policy — auth middleware now rejects unauthenticated writes.',
  checksRun: ['tsc --noEmit', 'vitest run'],
  failures: [],
  securityImpact: 'RLS enforced at DB level.',
  deploymentImpact: 'Requires migration run before Workers deploy.',
  rollbackPath: 'supabase migration revert 20260711_add_rls + redeploy prior revision.',
  unresolvedRisks: [],
};

// ---------------------------------------------------------------------------
// requiresFounderApproval
// ---------------------------------------------------------------------------

describe('requiresFounderApproval', () => {
  it('returns true for every APPROVAL_GATE id', () => {
    for (const id of APPROVAL_GATES) {
      expect(requiresFounderApproval(id)).toBe(true);
    }
  });

  it('returns false for an arbitrary gate id', () => {
    expect(requiresFounderApproval('schema-change')).toBe(false);
    expect(requiresFounderApproval('lint')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runProofGate — passing cases
// ---------------------------------------------------------------------------

describe('runProofGate — passing cases', () => {
  it('passes a non-approval gate with valid evidence', () => {
    const result = runProofGate('schema-change', validEvidence);
    expect(result.status).toBe('pass');
    expect(result.evidence.failures).toHaveLength(0);
  });

  it('passes an approval gate when approvedBy is set', () => {
    const result = runProofGate('deploy', validEvidence, 'jussray — approved 2026-07-11');
    expect(result.status).toBe('pass');
  });

  it('passes with unresolved risks when founder has acknowledged them', () => {
    const evidence: ProofEvidence = {
      ...validEvidence,
      unresolvedRisks: ['Token refresh race condition not yet fixed.'],
    };
    const result = runProofGate('schema-change', evidence, 'jussray — acknowledged');
    expect(result.status).toBe('pass');
  });

  it('includes timestamp and gateId in the result', () => {
    const result = runProofGate('lint', validEvidence);
    expect(result.gateId).toBe('lint');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// runProofGate — failure cases
// ---------------------------------------------------------------------------

describe('runProofGate — failure cases', () => {
  it('fails when filesChanged is empty', () => {
    const evidence: ProofEvidence = { ...validEvidence, filesChanged: [] };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
    expect(result.allFailures.some((failure) => failure.includes('No files reported'))).toBe(true);
  });

  it('fails when checksRun is empty (happy-path-only)', () => {
    const evidence: ProofEvidence = { ...validEvidence, checksRun: [] };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
    expect(result.allFailures.some((failure) => failure.includes('No checks reported'))).toBe(true);
  });

  it('fails when rollbackPath is empty', () => {
    const evidence: ProofEvidence = { ...validEvidence, rollbackPath: '' };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
    expect(result.allFailures.some((failure) => failure.includes('Rollback path'))).toBe(true);
  });

  it('fails when rollbackPath is whitespace only', () => {
    const evidence: ProofEvidence = { ...validEvidence, rollbackPath: '   ' };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
  });

  it('fails an approval gate without approvedBy', () => {
    const result = runProofGate('deploy', validEvidence);
    expect(result.status).toBe('fail');
    expect(
      result.allFailures.some((failure) => failure.includes("Gate 'deploy' is an approval gate")),
    ).toBe(true);
  });

  it('fails when caller-reported failures are present', () => {
    const evidence: ProofEvidence = {
      ...validEvidence,
      failures: ['TypeScript error in src/api/auth.ts'],
    };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
    expect(result.allFailures.some((failure) => failure.includes('check failure'))).toBe(true);
  });

  it('fails when unresolvedRisks are present without founder acknowledgement', () => {
    const evidence: ProofEvidence = {
      ...validEvidence,
      unresolvedRisks: ['Race condition in token refresh.'],
    };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
    expect(
      result.allFailures.some((failure) => failure.includes('unresolved risk')),
    ).toBe(true);
  });

  it('accumulates multiple failures in a single run', () => {
    const evidence: ProofEvidence = {
      ...validEvidence,
      filesChanged: [],
      checksRun: [],
      rollbackPath: '',
    };
    const result = runProofGate('schema-change', evidence);
    expect(result.status).toBe('fail');
    expect(result.allFailures.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// assertProofPassed
// ---------------------------------------------------------------------------

describe('assertProofPassed', () => {
  it('does not throw when status is pass', () => {
    const result = runProofGate('lint', validEvidence);
    expect(() => assertProofPassed(result)).not.toThrow();
  });

  it('throws ProofGateError when status is fail', () => {
    const evidence: ProofEvidence = { ...validEvidence, filesChanged: [] };
    const result = runProofGate('deploy', evidence);
    expect(() => assertProofPassed(result)).toThrow(ProofGateError);
  });

  it('ProofGateError includes the gateId and failure list', () => {
    const evidence: ProofEvidence = { ...validEvidence, filesChanged: [], checksRun: [] };
    const result = runProofGate('deploy', evidence);
    try {
      assertProofPassed(result);
      expect.fail('Expected ProofGateError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProofGateError);
      const gateError = error as ProofGateError;
      expect(gateError.gateId).toBe('deploy');
      expect(gateError.failures.length).toBeGreaterThan(0);
      expect(gateError.message).toContain('PROOF GATE FAILED');
    }
  });
});
