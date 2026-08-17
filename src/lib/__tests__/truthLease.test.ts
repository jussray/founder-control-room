import { describe, expect, it } from 'vitest';
import {
  buildTruthLeaseTelemetry,
  createTruthLease,
  evaluateTruthLeaseAtUse,
  hashTruthClaim,
  toTruthLeaseViewModel,
} from '../truthLease.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const PROVIDER_GREEN = 'c'.repeat(64);
const PROVIDER_RED = 'd'.repeat(64);

function makeLease() {
  return createTruthLease({
    claimHash: hashTruthClaim('Founder Control Room main is green.'),
    claimClass: 'repository-runtime-progress',
    verifiedAt: '2026-08-17T15:10:00.000Z',
    validUntil: '2026-08-17T15:30:00.000Z',
    dependencies: [
      { key: 'repository-main-head', authority: 'repository', expectedDigest: SHA_A, maxObservationAgeMs: 5 * 60 * 1000 },
      { key: 'cloudflare-worker-build', authority: 'provider', expectedDigest: PROVIDER_GREEN, maxObservationAgeMs: 2 * 60 * 1000 },
    ],
  });
}

function currentObservations() {
  return [
    { key: 'repository-main-head', authority: 'repository' as const, digest: SHA_A, observedAt: '2026-08-17T15:14:00.000Z' },
    { key: 'cloudflare-worker-build', authority: 'provider' as const, digest: PROVIDER_GREEN, observedAt: '2026-08-17T15:14:30.000Z' },
  ];
}

describe('truth lease at-use contract', () => {
  it('allows a claim only when every bound fact is freshly re-observed at the use boundary', () => {
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations: currentObservations(), useBoundary: 'publish', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('current');
    expect(evaluation.mayUseClaim).toBe(true);
    expect(evaluation.reasons).toEqual([]);
    expect(toTruthLeaseViewModel(evaluation)).toEqual({ state: 'current', label: 'Current proof', nextGate: 'use-claim', mayUseClaim: true });
  });

  it('invalidates a once-true claim when main moves before the claim is used', () => {
    const observations = currentObservations();
    observations[0] = { ...observations[0], digest: SHA_B, observedAt: '2026-08-17T15:14:50.000Z' };
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations, useBoundary: 'completion-claim', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('invalidated');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons).toContain('dependency repository-main-head no longer matches verified truth');
    expect(toTruthLeaseViewModel(evaluation).label).toBe('Truth changed');
  });

  it('invalidates a once-green provider claim when the provider turns red before use', () => {
    const observations = currentObservations();
    observations[1] = { ...observations[1], digest: PROVIDER_RED, observedAt: '2026-08-17T15:14:55.000Z' };
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations, useBoundary: 'deploy', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('invalidated');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.invalidatedDependencyCount).toBe(1);
  });

  it('returns UNKNOWN instead of green when an at-use observation is missing', () => {
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations: currentObservations().slice(0, 1), useBoundary: 'schedule', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('unknown');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.unknownDependencyCount).toBe(1);
    expect(toTruthLeaseViewModel(evaluation).label).toBe('Proof missing');
  });

  it('fails closed on duplicate observations instead of letting array order decide truth', () => {
    const observations = currentObservations();
    observations.push({ key: 'repository-main-head', authority: 'repository', digest: SHA_B, observedAt: '2026-08-17T15:14:59.000Z' });
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations, useBoundary: 'completion-claim', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('unknown');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons).toContain('dependency repository-main-head has ambiguous duplicate at-use observations');
  });

  it('returns UNKNOWN for a malformed observation timestamp instead of throwing or assuming freshness', () => {
    const observations = currentObservations();
    observations[1] = { ...observations[1], observedAt: 'not-a-time' };
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations, useBoundary: 'publish', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('unknown');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons).toContain('dependency cloudflare-worker-build observation time is invalid');
  });

  it('marks an observation stale even when its value still matches', () => {
    const observations = currentObservations();
    observations[1] = { ...observations[1], observedAt: '2026-08-17T15:11:00.000Z' };
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations, useBoundary: 'publish', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('stale');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.staleDependencyCount).toBe(1);
    expect(toTruthLeaseViewModel(evaluation).nextGate).toBe('revalidate-proof');
  });

  it('expires the whole lease without converting the old truth into a lie', () => {
    const evaluation = evaluateTruthLeaseAtUse({
      lease: makeLease(),
      observations: currentObservations().map((observation) => ({ ...observation, observedAt: '2026-08-17T15:30:10.000Z' })),
      useBoundary: 'completion-claim',
      now: '2026-08-17T15:30:10.000Z',
    });
    expect(evaluation.state).toBe('stale');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons).toContain('truth lease expired before use');
  });

  it('fails closed when the lease identity is mutated', () => {
    const lease = makeLease();
    const evaluation = evaluateTruthLeaseAtUse({ lease: { ...lease, claimClass: 'production-live' }, observations: currentObservations(), useBoundary: 'publish', now: '2026-08-17T15:15:00.000Z' });
    expect(evaluation.state).toBe('invalidated');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons).toContain('truth lease identity has been mutated');
  });

  it('emits sauce-minimal analytics without claim text, proof digests, or provider payloads', () => {
    const evaluation = evaluateTruthLeaseAtUse({ lease: makeLease(), observations: currentObservations(), useBoundary: 'publish', now: '2026-08-17T15:15:00.000Z' });
    const telemetry = buildTruthLeaseTelemetry(evaluation, 'repository-runtime-progress');
    const serialized = JSON.stringify(telemetry);
    expect(telemetry.event).toBe('fcr:truth-lease-evaluated');
    expect(telemetry.state).toBe('current');
    expect(serialized).not.toContain('Founder Control Room main is green');
    expect(serialized).not.toContain(SHA_A);
    expect(serialized).not.toContain(PROVIDER_GREEN);
  });

  it('caps truth leases so old proof cannot silently become standing authority', () => {
    expect(() => createTruthLease({
      claimHash: hashTruthClaim('A long-lived claim'),
      claimClass: 'repository-runtime-progress',
      verifiedAt: '2026-08-17T15:00:00.000Z',
      validUntil: '2026-08-17T16:00:01.000Z',
      dependencies: [{ key: 'runtime', authority: 'runtime', expectedDigest: SHA_A, maxObservationAgeMs: 60_000 }],
    })).toThrow(/lease lifetime may not exceed 60 minutes/);
  });
});
