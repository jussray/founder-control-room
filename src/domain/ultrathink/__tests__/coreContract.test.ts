import { describe, expect, it } from 'vitest';
import {
  evaluateAuthorityLease,
  type UltrathinkActionContract,
} from '../coreContract.js';

const NOW = Date.parse('2026-08-22T22:50:00.000Z');

function contract(overrides: Partial<UltrathinkActionContract> = {}): UltrathinkActionContract {
  return {
    identity: {
      kind: 'merge',
      projectId: 'project-1',
      resourceId: 'mission-1',
      target: 'main@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      candidate: 'pr#581@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    evidence: [{
      id: 'proof-1',
      gateId: 'merge',
      state: 'pass',
      observedAt: '2026-08-22T22:45:00.000Z',
      expiresAt: '2026-08-22T23:00:00.000Z',
    }],
    authority: {
      approvedBy: 'founder',
      approvedAt: '2026-08-22T22:45:00.000Z',
      expiresAt: '2026-08-22T23:00:00.000Z',
      revision: 1,
    },
    ...overrides,
  };
}

describe('ULTRATHINK core action contract', () => {
  it('accepts a live authority lease backed by passing evidence', () => {
    expect(evaluateAuthorityLease(contract(), NOW)).toEqual({
      status: 'valid',
      reason: 'authority lease and evidence are valid',
    });
  });

  it('expires authority instead of treating old proof as permanent', () => {
    const value = contract({
      authority: {
        approvedBy: 'founder',
        approvedAt: '2026-08-22T22:30:00.000Z',
        expiresAt: '2026-08-22T22:49:59.000Z',
        revision: 1,
      },
    });

    expect(evaluateAuthorityLease(value, NOW).status).toBe('expired');
  });

  it('fails closed when evidence is failed or not evaluated', () => {
    for (const state of ['fail', 'not_evaluated'] as const) {
      const value = contract({
        evidence: [{
          id: 'proof-1',
          gateId: 'merge',
          state,
          observedAt: '2026-08-22T22:45:00.000Z',
        }],
      });
      expect(evaluateAuthorityLease(value, NOW).status).toBe('invalid_evidence');
    }
  });

  it('fails closed on malformed identity or approval revision', () => {
    const value = contract({
      identity: {
        kind: 'merge',
        projectId: '',
        resourceId: 'mission-1',
        target: 'main',
        candidate: 'candidate',
      },
    });
    expect(evaluateAuthorityLease(value, NOW).status).toBe('malformed');
  });
});
