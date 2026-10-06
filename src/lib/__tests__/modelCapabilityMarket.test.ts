import { describe, expect, it } from 'vitest';
import {
  buildCapabilityRoute,
  rankCapabilityCandidates,
  type CapabilityCandidate,
  type CapabilityObservation,
  type ExternalBenchmarkPrior,
} from '../modelCapabilityMarket.js';

const now = new Date('2026-09-22T23:30:00.000Z');

const candidates: CapabilityCandidate[] = [
  { operatorId: 'claude-code', providerFamily: 'anthropic', taskClasses: ['repository-repair', 'architecture-review'], capability: 'implement' },
  { operatorId: 'codex', providerFamily: 'openai', taskClasses: ['repository-repair', 'architecture-review'], capability: 'implement' },
  { operatorId: 'muse', providerFamily: 'meta', taskClasses: ['repository-repair', 'cross-provider-drift'], capability: 'review' },
];

function observation(operatorId: string, overrides: Partial<CapabilityObservation> = {}): CapabilityObservation {
  return {
    operatorId,
    taskClass: 'repository-repair',
    observedAt: '2026-09-22T22:30:00.000Z',
    sampleSize: 5,
    successRate: 0.9,
    proofRate: 0.9,
    falseGreenRate: 0,
    authorityViolationRate: 0,
    rootCauseAccuracy: 0.9,
    medianCostUsd: 0.5,
    medianDurationMs: 30_000,
    evidenceRefs: [`receipt:${operatorId}:1`],
    ...overrides,
  };
}

function benchmark(operatorId: string, score: number): ExternalBenchmarkPrior {
  return { operatorId, taskClass: 'repository-repair', observedAt: '2026-09-22T20:00:00.000Z', score, sourceRef: `public-benchmark:${operatorId}` };
}

describe('proof-weighted model capability market', () => {
  it('keeps an external benchmark leader in trial when local outcome proof is missing', () => {
    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair', candidates,
      observations: [observation('codex')],
      benchmarkPriors: [benchmark('claude-code', 1), benchmark('codex', 0.2)],
      options: { now },
    });
    const codex = ranked.find((candidate) => candidate.operatorId === 'codex');
    const claude = ranked.find((candidate) => candidate.operatorId === 'claude-code');
    expect(codex?.status).toBe('eligible');
    expect(claude?.status).toBe('trial');
    expect(ranked[0]?.operatorId).toBe('codex');
    expect(claude?.reasons).toContain('external benchmark is treated only as a bounded prior, never outcome proof');
  });

  it('blocks primary routing when fresh evidence records any authority violation', () => {
    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair', candidates,
      observations: [observation('claude-code', { authorityViolationRate: 0.01 }), observation('codex', { successRate: 0.8 })],
      benchmarkPriors: [benchmark('claude-code', 1)], options: { now },
    });
    const claude = ranked.find((candidate) => candidate.operatorId === 'claude-code');
    expect(claude?.status).toBe('blocked');
    expect(claude?.selectionAuthority).toBe(false);
    expect(claude?.executionAuthority).toBe(false);
  });

  it('penalizes false-green behavior even when raw success looks high', () => {
    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair', candidates,
      observations: [observation('claude-code', { successRate: 1, falseGreenRate: 0.4 }), observation('codex', { successRate: 0.9, falseGreenRate: 0 })],
      options: { now },
    });
    expect(ranked[0]?.operatorId).toBe('codex');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it('selects a cross-provider challenger and keeps new contenders in shadow trials', () => {
    const route = buildCapabilityRoute({
      taskClass: 'repository-repair', candidates,
      observations: [observation('claude-code', { successRate: 0.95 }), observation('codex', { successRate: 0.85 })],
      benchmarkPriors: [benchmark('muse', 0.99)], options: { now },
    });
    expect(route.primary?.operatorId).toBe('claude-code');
    expect(route.challenger?.operatorId).toBe('codex');
    expect(route.challenger?.providerFamily).not.toBe(route.primary?.providerFamily);
    expect(route.shadowTrials.map((candidate) => candidate.operatorId)).toContain('muse');
    expect(route.selectionAuthority).toBe(false);
    expect(route.executionAuthority).toBe(false);
  });

  it('expires stale local proof instead of allowing old wins to self-renew', () => {
    const ranked = rankCapabilityCandidates({
      taskClass: 'repository-repair', candidates,
      observations: [observation('claude-code', { observedAt: '2026-06-01T00:00:00.000Z' })],
      benchmarkPriors: [benchmark('claude-code', 0.9)],
      options: { now, maxObservationAgeMs: 7 * 24 * 60 * 60 * 1000 },
    });
    const claude = ranked.find((candidate) => candidate.operatorId === 'claude-code');
    expect(claude?.localSamples).toBe(0);
    expect(claude?.status).toBe('trial');
  });
});
