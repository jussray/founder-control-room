import { describe, expect, it } from 'vitest';
import {
  auditTruthDecay,
  buildTruthDecayTelemetry,
} from '../truthDecayAudit.js';
import {
  createTruthLease,
  hashTruthClaim,
  type TruthDependencyObservation,
  type TruthLease,
} from '../truthLease.js';

const REPO_DIGEST = 'a'.repeat(64);

function lease(): TruthLease {
  return createTruthLease({
    claimHash: hashTruthClaim('The exact repository state is current.'),
    claimClass: 'current_repo_state',
    verifiedAt: '2026-08-19T06:00:00.000Z',
    validUntil: '2026-08-19T06:50:00.000Z',
    dependencies: [{
      key: 'repository:main',
      authority: 'repository',
      expectedDigest: REPO_DIGEST,
      maxObservationAgeMs: 10 * 60 * 1000,
    }],
  });
}

function observation(overrides: Partial<TruthDependencyObservation> = {}): TruthDependencyObservation {
  return {
    key: 'repository:main',
    authority: 'repository',
    digest: REPO_DIGEST,
    observedAt: '2026-08-19T06:35:00.000Z',
    ...overrides,
  };
}

describe('truth decay causal audit', () => {
  it('keeps a freshly re-observed matching claim current', () => {
    const report = auditTruthDecay({
      lease: lease(),
      observations: [observation()],
      useBoundary: 'publish',
      now: '2026-08-19T06:40:00.000Z',
    });

    expect(report).toMatchObject({
      state: 'current',
      mayUseCurrentClaim: true,
      historicalStatus: 'current',
      currentWording: 'current-allowed',
      causeClasses: [],
      nextGate: 'use-claim',
    });
  });

  it('explains time decay without rewriting the old fact as false history', () => {
    const report = auditTruthDecay({
      lease: lease(),
      observations: [observation({ observedAt: '2026-08-19T06:05:00.000Z' })],
      useBoundary: 'publish',
      now: '2026-08-19T06:40:00.000Z',
    });

    expect(report.state).toBe('stale');
    expect(report.mayUseCurrentClaim).toBe(false);
    expect(report.historicalStatus).toBe('historical-verified');
    expect(report.currentWording).toBe('historical-only');
    expect(report.causeClasses).toContain('observation-stale');
    expect(report.nextGate).toBe('revalidate-proof');
  });

  it('classifies changed authoritative state as superseding current use', () => {
    const report = auditTruthDecay({
      lease: lease(),
      observations: [observation({ digest: 'b'.repeat(64) })],
      useBoundary: 'completion-claim',
      now: '2026-08-19T06:40:00.000Z',
    });

    expect(report.state).toBe('invalidated');
    expect(report.historicalStatus).toBe('historical-verified');
    expect(report.currentWording).toBe('historical-only');
    expect(report.causeClasses).toContain('dependency-changed');
    expect(report.nextGate).toBe('rebuild-claim');
  });

  it('fails closed when fresh evidence disappears', () => {
    const report = auditTruthDecay({
      lease: lease(),
      observations: [],
      useBoundary: 'merge',
      now: '2026-08-19T06:40:00.000Z',
    });

    expect(report.state).toBe('unknown');
    expect(report.mayUseCurrentClaim).toBe(false);
    expect(report.historicalStatus).toBe('historical-verified');
    expect(report.causeClasses).toContain('evidence-missing');
    expect(report.nextGate).toBe('collect-proof');
  });

  it('does not preserve historical trust when the lease itself was mutated', () => {
    const original = lease();
    const tampered = { ...original, claimClass: 'different-claim-class' } as TruthLease;
    const report = auditTruthDecay({
      lease: tampered,
      observations: [observation()],
      useBoundary: 'publish',
      now: '2026-08-19T06:40:00.000Z',
    });

    expect(report.state).toBe('invalidated');
    expect(report.historicalStatus).toBe('untrusted');
    expect(report.currentWording).toBe('hold');
    expect(report.causeClasses).toContain('lease-integrity');
  });

  it('emits analytics without sauce, raw reasons, dependency identities, or digests', () => {
    const report = auditTruthDecay({
      lease: lease(),
      observations: [observation({ digest: 'b'.repeat(64) })],
      useBoundary: 'publish',
      now: '2026-08-19T06:40:00.000Z',
    });
    const telemetry = buildTruthDecayTelemetry(report);
    const serialized = JSON.stringify(telemetry);

    expect(telemetry.event).toBe('fcr:truth-decay-audited');
    expect(telemetry.causeClasses).toContain('dependency-changed');
    expect(telemetry).not.toHaveProperty('reasons');
    expect(serialized).not.toContain('repository:main');
    expect(serialized).not.toContain(REPO_DIGEST);
    expect(serialized).not.toContain('b'.repeat(64));
  });
});
