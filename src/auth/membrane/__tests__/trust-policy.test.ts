import { describe, expect, it } from 'vitest';
import {
  type EvaluateTrustInput,
  type FcrActionRisk,
  type FcrSessionState,
} from '../session-types.js';
import { evaluateTrustPolicy } from '../trust-policy.js';

const NOW = '2026-08-29T18:00:00.000Z';
const BINDING = 'A'.repeat(43);
const OTHER_BINDING = 'B'.repeat(43);

function session(overrides: Partial<FcrSessionState> = {}): FcrSessionState {
  return {
    sessionId: 'opaque-session-reference',
    actorId: 'founder-user-id',
    issuedAt: '2026-08-29T17:00:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
    lastSeenAt: '2026-08-29T17:55:00.000Z',
    fingerprintVersion: 'fpv1',
    fingerprintBinding: BINDING,
    trustState: 'trusted',
    sessionVersion: 1,
    ...overrides,
  };
}

function evaluate(
  actionRisk: FcrActionRisk,
  overrides: Partial<EvaluateTrustInput> = {},
) {
  return evaluateTrustPolicy({
    session: session(),
    observation: { version: 'fpv1', binding: BINDING },
    actionRisk,
    now: NOW,
    ...overrides,
  });
}

describe('FCR drift-aware trust policy', () => {
  it('keeps ASN changes in evidence only when the fingerprint binding still matches', () => {
    const decision = evaluate('high-impact', {
      evidence: {
        observedAt: NOW,
        priorAsn: 7922,
        currentAsn: 21928,
        priorCountry: 'US',
        currentCountry: 'US',
      },
    });

    expect(decision).toEqual(expect.objectContaining({
      continuity: 'TRUSTED',
      verdict: 'TRUSTED',
      bindingMatched: true,
      asnChanged: true,
      countryChanged: false,
      requiresAuthorityLease: true,
      executionAuthorized: false,
    }));
  });

  it('does not let country or ASN evidence manufacture drift when the binding matches', () => {
    const decision = evaluate('read', {
      evidence: {
        observedAt: NOW,
        priorAsn: 64500,
        currentAsn: 64501,
        priorCountry: 'US',
        currentCountry: 'CA',
      },
    });

    expect(decision.continuity).toBe('TRUSTED');
    expect(decision.verdict).toBe('TRUSTED');
    expect(decision.asnChanged).toBe(true);
    expect(decision.countryChanged).toBe(true);
  });

  it('classifies a fingerprint mismatch as DRIFTED for safe reads', () => {
    const decision = evaluate('read', {
      observation: { version: 'fpv1', binding: OTHER_BINDING },
    });

    expect(decision).toEqual(expect.objectContaining({
      continuity: 'DRIFTED',
      verdict: 'DRIFTED',
      bindingMatched: false,
      executionAuthorized: false,
    }));
  });

  it('requires step-up for a drifted high-impact action', () => {
    const decision = evaluate('high-impact', {
      observation: { version: 'fpv1', binding: OTHER_BINDING },
    });

    expect(decision).toEqual(expect.objectContaining({
      continuity: 'DRIFTED',
      verdict: 'STEP_UP_REQUIRED',
      requiresAuthorityLease: true,
      executionAuthorized: false,
    }));
  });

  it('allows a drifted session to remain proposal-only without granting execution', () => {
    const decision = evaluate('proposal', {
      session: session({ trustState: 'drifted' }),
    });

    expect(decision.continuity).toBe('DRIFTED');
    expect(decision.verdict).toBe('DRIFTED');
    expect(decision.executionAuthorized).toBe(false);
  });

  it.each([
    ['missing', null],
    ['expired', session({ expiresAt: '2026-08-29T17:59:59.000Z' })],
    ['revoked', session({ trustState: 'revoked', revokedAt: '2026-08-29T17:45:00.000Z' })],
    ['invalid', session({ expiresAt: 'not-a-date' })],
  ])('returns REVOKED for a %s session', (_label, candidate) => {
    const decision = evaluateTrustPolicy({
      session: candidate,
      observation: { version: 'fpv1', binding: BINDING },
      actionRisk: 'high-impact',
      now: NOW,
    });

    expect(decision.continuity).toBe('REVOKED');
    expect(decision.verdict).toBe('REVOKED');
    expect(decision.executionAuthorized).toBe(false);
  });

  it('treats missing or version-mismatched fingerprint observations as drift, not authentication', () => {
    const missing = evaluate('read', {
      observation: { version: 'fpv1', binding: null },
    });
    const versionMismatch = evaluate('read', {
      observation: { version: 'fpv2', binding: BINDING },
    });

    expect(missing.verdict).toBe('DRIFTED');
    expect(versionMismatch.verdict).toBe('DRIFTED');
    expect(missing.executionAuthorized).toBe(false);
    expect(versionMismatch.executionAuthorized).toBe(false);
  });

  it('never converts TRUSTED transport posture into execution authority', () => {
    const decision = evaluate('high-impact');

    expect(decision.verdict).toBe('TRUSTED');
    expect(decision.requiresAuthorityLease).toBe(true);
    expect(decision.executionAuthorized).toBe(false);
  });
});
