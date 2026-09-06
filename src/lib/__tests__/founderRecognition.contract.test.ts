import { describe, expect, it } from 'vitest';

const {
  buildFounderRecognitionEvidence,
  compileFounderRecognitionChain,
} = require('../../../tools/zapier/founder-recognition-contract.cjs') as {
  buildFounderRecognitionEvidence: (input: Record<string, unknown>) => Record<string, any>;
  compileFounderRecognitionChain: (items: Record<string, unknown>[]) => Record<string, any>;
};

function evidence(overrides: Record<string, unknown> = {}) {
  return buildFounderRecognitionEvidence({
    chain_id: 'chief-143-proofmode',
    dedup_key: 'github-chief-143-head',
    scope: 'Chief AI',
    source_type: 'github',
    source_ref: 'https://github.com/jussray/chief-ai-machine/pull/143',
    source_identity: '62578a59be0cb70b0163f8f90dbc393a2129bca2',
    classification: 'VERIFIED',
    outcome_plane: 'EXECUTION_SOURCE',
    evidence_freshness: 'current',
    observed_at: '2026-09-05T04:00:00.000Z',
    outcome_claim: 'Chief exact-head source state was verified.',
    proves: ['exact-head-source-state'],
    does_not_prove: ['runtime-identity', 'browser-behavior', 'external-consequence'],
    contradiction_refs: [],
    supersedes_dedup_keys: [],
    ...overrides,
  });
}

describe('Founder Recognition causal proof compiler', () => {
  it('recognizes one causal chain at the highest proven plane', () => {
    const source = evidence();
    const test = evidence({
      dedup_key: 'github-chief-143-tests',
      outcome_plane: 'TEST',
      observed_at: '2026-09-05T04:01:00.000Z',
      outcome_claim: 'Chief exact-head source tests passed.',
      proves: ['exact-head-test-state'],
    });

    const compiled = compileFounderRecognitionChain([source, test]);
    expect(compiled.classification).toBe('VERIFIED');
    expect(compiled.highest_outcome_plane).toBe('TEST');
    expect(compiled.recognized_outcome).toBe('Chief exact-head source tests passed.');
    expect(compiled.evidence_hashes).toHaveLength(2);
  });

  it('deduplicates the same event instead of counting it twice', () => {
    const source = evidence();
    const compiled = compileFounderRecognitionChain([source, source]);
    expect(compiled.classification).toBe('VERIFIED');
    expect(compiled.evidence_hashes).toHaveLength(1);
    expect(compiled.duplicate_count).toBe(1);
  });

  it('fails closed when the same dedup key carries conflicting evidence', () => {
    const source = evidence();
    const conflict = evidence({
      outcome_claim: 'Different claim on the same event identity.',
      proves: ['different-scope'],
    });

    const compiled = compileFounderRecognitionChain([source, conflict]);
    expect(compiled.classification).toBe('HOLD');
    expect(compiled.highest_outcome_plane).toBeNull();
    expect(compiled.contradiction_refs).toContain('dedup:github-chief-143-head');
  });

  it('does not reuse stale verified evidence as current recognition', () => {
    expect(() => evidence({ evidence_freshness: 'stale' })).toThrow(/VERIFIED evidence must be current/);
  });

  it('forbids GitHub source evidence from claiming runtime truth', () => {
    expect(() => evidence({ outcome_plane: 'RUNTIME' })).toThrow(/github may not certify RUNTIME/);
  });

  it('allows Playwright to advance the same chain to browser proof', () => {
    const source = evidence();
    const browser = evidence({
      dedup_key: 'playwright-chief-143-browser',
      source_type: 'playwright',
      source_ref: 'github-actions://chief-143/playwright',
      outcome_plane: 'BROWSER',
      observed_at: '2026-09-05T04:02:00.000Z',
      outcome_claim: 'The exact runtime passed the browser assertions.',
      proves: ['browser-behavior'],
      does_not_prove: ['customer-outcome'],
    });

    const compiled = compileFounderRecognitionChain([source, browser]);
    expect(compiled.highest_outcome_plane).toBe('BROWSER');
    expect(compiled.recognized_outcome).toMatch(/browser assertions/);
  });

  it('keeps a blocked higher plane visible without inventing success', () => {
    const source = evidence();
    const runtimeBlock = evidence({
      dedup_key: 'runtime-chief-143-access-block',
      source_type: 'runtime',
      source_ref: 'https://preview.example/version',
      classification: 'BLOCKED',
      outcome_plane: 'RUNTIME',
      observed_at: '2026-09-05T04:03:00.000Z',
      outcome_claim: 'Runtime identity remains blocked by provider access.',
      proves: [],
      does_not_prove: ['runtime-identity'],
    });

    const compiled = compileFounderRecognitionChain([source, runtimeBlock]);
    expect(compiled.classification).toBe('VERIFIED');
    expect(compiled.highest_outcome_plane).toBe('EXECUTION_SOURCE');
    expect(compiled.blocked_planes).toContain('RUNTIME');
  });

  it('treats missing source coverage as a coverage state, not a win', () => {
    const missing = evidence({
      chain_id: 'slides-coverage-2026-09-05',
      dedup_key: 'slides-coverage-2026-09-05',
      source_type: 'drive',
      source_ref: 'google-drive://presentations',
      classification: 'BLOCKED',
      outcome_plane: 'COVERAGE_UNKNOWN',
      outcome_claim: null,
      proves: [],
      does_not_prove: ['slides-outcomes'],
    });

    const compiled = compileFounderRecognitionChain([missing]);
    expect(compiled.classification).toBe('BLOCKED');
    expect(compiled.highest_outcome_plane).toBeNull();
    expect(compiled.recognized_outcome).toBeNull();
  });

  it('does not let proposal context masquerade as delivered external consequence', () => {
    expect(() => evidence({
      source_type: 'proposal',
      source_ref: 'Proposal for Juss Ray.pdf',
      outcome_plane: 'EXTERNAL_CONSEQUENCE',
      outcome_claim: 'The pilot produced market impact.',
    })).toThrow(/proposal may not certify EXTERNAL_CONSEQUENCE/);
  });

  it('preserves supersession instead of double-recognizing predecessor evidence', () => {
    const predecessor = evidence({
      dedup_key: 'github-chief-old-head',
      source_identity: 'a'.repeat(40),
      observed_at: '2026-09-05T03:00:00.000Z',
      outcome_claim: 'Old head source state was verified.',
    });
    const successor = evidence({
      dedup_key: 'github-chief-new-head',
      source_identity: 'b'.repeat(40),
      observed_at: '2026-09-05T04:00:00.000Z',
      outcome_claim: 'Successor head source state was verified.',
      supersedes_dedup_keys: ['github-chief-old-head'],
    });

    const compiled = compileFounderRecognitionChain([predecessor, successor]);
    expect(compiled.evidence_hashes).toHaveLength(1);
    expect(compiled.superseded_dedup_keys).toContain('github-chief-old-head');
    expect(compiled.recognized_outcome).toBe('Successor head source state was verified.');
  });
});
