import { describe, expect, it } from 'vitest';
import { toProjectShellStateView } from '../projectShellState.js';

const NOW = new Date('2026-09-11T22:00:00.000Z');

function base(overrides: Record<string, unknown> = {}) {
  return {
    truth: {
      classification: 'verified',
      observed_at: '2026-09-11T21:50:00.000Z',
      expires_at: '2026-09-11T22:10:00.000Z',
      conflicts: [],
    },
    continuity: {
      valid_until: '2026-09-11T22:10:00.000Z',
      invalidated_at: null,
    },
    outcome: {
      classification: 'achieved',
      observed_at: '2026-09-11T21:55:00.000Z',
      evidence: [{ receipt: 'server-only' }],
    },
    resources: [{ resource_type: 'founder_hours', unit: 'hours', ceiling: 24, consumed: 5, metadata: { private: true } }],
    recovery: {
      status: 'available',
      rollback: { ref: 'internal' },
      retry: {},
      reconcile: { ref: 'internal' },
      compensate: {},
      abandon: {},
    },
    ...overrides,
  };
}

describe('project shell state view', () => {
  it('allows a verified outcome claim only when truth is fresh and achieved outcome evidence exists', () => {
    const view = toProjectShellStateView(base(), NOW);
    expect(view.classification).toBe('verified');
    expect(view.mayClaimVerifiedOutcome).toBe(true);
    expect(view.outcome).toEqual({
      classification: 'achieved',
      observedAt: '2026-09-11T21:55:00.000Z',
      hasEvidence: true,
    });
  });

  it('fails closed when a verified truth snapshot is expired', () => {
    const view = toProjectShellStateView(base({
      truth: {
        classification: 'verified',
        observed_at: '2026-09-11T21:00:00.000Z',
        expires_at: '2026-09-11T21:59:59.000Z',
        conflicts: [],
      },
    }), NOW);
    expect(view.classification).toBe('stale');
    expect(view.reason).toBe('truth_snapshot_expired');
    expect(view.mayClaimVerifiedOutcome).toBe(false);
  });

  it('does not promote verified truth without achieved outcome evidence', () => {
    const view = toProjectShellStateView(base({
      outcome: {
        classification: 'achieved',
        observed_at: '2026-09-11T21:55:00.000Z',
        evidence: [],
      },
    }), NOW);
    expect(view.classification).toBe('verified');
    expect(view.outcome?.hasEvidence).toBe(false);
    expect(view.mayClaimVerifiedOutcome).toBe(false);
  });

  it('never treats continuity as authority and marks invalidated continuity invalid', () => {
    const view = toProjectShellStateView(base({
      continuity: {
        valid_until: '2026-09-11T23:00:00.000Z',
        invalidated_at: '2026-09-11T21:58:00.000Z',
      },
    }), NOW);
    expect(view.continuity).toEqual({
      present: true,
      valid: false,
      validUntil: '2026-09-11T23:00:00.000Z',
      invalidatedAt: '2026-09-11T21:58:00.000Z',
    });
  });

  it('returns only browser-safe resource and recovery summaries', () => {
    const view = toProjectShellStateView(base(), NOW);
    expect(view.resources).toEqual([{ type: 'founder_hours', unit: 'hours', ceiling: 24, consumed: 5 }]);
    expect(view.recovery).toEqual({ status: 'available', modesAvailable: ['rollback', 'reconcile'] });
    expect(JSON.stringify(view)).not.toContain('server-only');
    expect(JSON.stringify(view)).not.toContain('private');
    expect(JSON.stringify(view)).not.toContain('internal');
  });

  it('normalizes missing truth to UNKNOWN and blocks verification', () => {
    const view = toProjectShellStateView(base({ truth: null }), NOW);
    expect(view.classification).toBe('unknown');
    expect(view.reason).toBe('no_truth_snapshot');
    expect(view.mayClaimVerifiedOutcome).toBe(false);
  });
});
