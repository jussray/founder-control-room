import { describe, expect, it } from 'vitest';
import { evaluateMainEvidence } from '../src/evaluator.js';
import type { MainEvidenceDecisionV0, WitnessPolicyV0, WitnessResultV0 } from '../src/contracts.v0.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const POLICY_HASH = `sha256:${'c'.repeat(64)}` as const;
const EVIDENCE_HASH = `sha256:${'d'.repeat(64)}` as const;
const SCENARIO = `sha256:${'e'.repeat(64)}` as const;
const NOW = '2026-08-23T22:00:00.000Z';

const policy: WitnessPolicyV0 = {
  kind: 'witness-policy.v0',
  policyVersion: 'v0',
  policyHash: POLICY_HASH,
  repo: 'jussray/founder-control-room',
  requiredWitnesses: [
    { id: 'typecheck', class: 'code', exactShaRequired: true },
    { id: 'playwright', class: 'product', exactShaRequired: true, scenarioFingerprint: SCENARIO },
  ],
};

function witness(witnessId: string, overrides: Partial<WitnessResultV0> = {}): WitnessResultV0 {
  return {
    kind: 'witness-result.v0',
    witnessId,
    state: 'PASS',
    evaluatedSha: SHA_B,
    policyHash: POLICY_HASH,
    scenarioFingerprint: witnessId === 'playwright' ? SCENARIO : undefined,
    evidenceRef: `artifact:${witnessId}`,
    evidenceHash: EVIDENCE_HASH,
    observedAt: '2026-08-23T21:59:00.000Z',
    correlationId: 'corr-b',
    ...overrides,
  };
}

function evaluate(results: WitnessResultV0[], prior?: MainEvidenceDecisionV0, overrides: Record<string, unknown> = {}) {
  return evaluateMainEvidence({
    now: NOW,
    repo: policy.repo,
    correlationId: 'corr-b',
    sourceAuthority: {
      kind: 'source-authority.v0', repo: policy.repo, branch: 'main', authoritativeSha: SHA_B,
      observedAt: NOW, source: 'github', correlationId: 'corr-b',
    },
    prior,
    policy,
    witnessResults: results,
    ...overrides,
  });
}

describe('portfolio Attack Ten', () => {
  it('never verifies a green result from an earlier SHA', () => {
    expect(evaluate([witness('typecheck', { evaluatedSha: SHA_A }), witness('playwright')]).state).toBe('STALE');
  });

  it('preserves stale lineage when main advances before missing proof returns', () => {
    const prior = evaluateMainEvidence({
      now: NOW, repo: policy.repo, correlationId: 'corr-a',
      sourceAuthority: { kind: 'source-authority.v0', repo: policy.repo, branch: 'main', authoritativeSha: SHA_A, observedAt: NOW, source: 'github', correlationId: 'corr-a' },
      policy,
      witnessResults: [witness('typecheck', { evaluatedSha: SHA_A }), witness('playwright', { evaluatedSha: SHA_A })],
    });
    expect(evaluate([], prior)).toMatchObject({ state: 'STALE', reason: 'MAIN_SHA_CHANGED', lastVerifiedSha: SHA_A });
  });

  it('never verifies a pass without immutable evaluated SHA', () => {
    expect(evaluate([witness('typecheck', { evaluatedSha: undefined }), witness('playwright')]).state).toBe('STALE');
  });

  it('invalidates inherited trust when policy changes', () => {
    const prior = evaluate([witness('typecheck'), witness('playwright')]);
    const changedPolicy = { ...policy, policyHash: `sha256:${'f'.repeat(64)}` as const };
    expect(evaluateMainEvidence({ now: NOW, repo: policy.repo, correlationId: 'corr-c', sourceAuthority: { kind: 'source-authority.v0', repo: policy.repo, branch: 'main', authoritativeSha: SHA_B, observedAt: NOW, source: 'github', correlationId: 'corr-c' }, prior, policy: changedPolicy, witnessResults: [] })).toMatchObject({ state: 'UNKNOWN', reason: 'POLICY_CHANGED' });
  });

  it('rejects the same witness name with a changed scenario fingerprint', () => {
    expect(evaluate([witness('typecheck'), witness('playwright', { scenarioFingerprint: `sha256:${'9'.repeat(64)}` })]).state).toBe('STALE');
  });

  it('never verifies an explicit MISSING result', () => {
    expect(evaluate([witness('typecheck', { state: 'MISSING' }), witness('playwright')]).state).toBe('UNKNOWN');
  });

  it('never verifies an explicit STALE result', () => {
    expect(evaluate([witness('typecheck', { state: 'STALE' }), witness('playwright')]).state).toBe('STALE');
  });

  it('blocks unresolvable evidence instead of inferring trust', () => {
    expect(evaluate([witness('typecheck', { evidenceRef: undefined }), witness('playwright')])).toMatchObject({ state: 'BLOCKED', reason: 'WITNESS_UNRESOLVABLE' });
  });

  it('blocks when source authority cannot be resolved', () => {
    expect(evaluate([witness('typecheck'), witness('playwright')], undefined, { sourceAuthority: undefined })).toMatchObject({ state: 'BLOCKED', reason: 'SOURCE_AUTHORITY_UNRESOLVED' });
  });

  it('is deterministic for identical inputs', () => {
    const input = [witness('typecheck'), witness('playwright')];
    expect(evaluate(input)).toEqual(evaluate(input));
  });
});
