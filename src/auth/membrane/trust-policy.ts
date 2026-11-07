import {
  FINGERPRINT_VERSION,
  type EvaluateTrustInput,
  type FcrSessionState,
  type TrustDecision,
} from './session-types.js';

const FPV1_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function networkEvidenceChanged(
  current: number | string | null | undefined,
  prior: number | string | null | undefined,
): boolean {
  return current != null && prior != null && current !== prior;
}

function revokedDecision(reason: TrustDecision['reason']): TrustDecision {
  return {
    continuity: 'REVOKED',
    verdict: 'REVOKED',
    bindingMatched: false,
    asnChanged: false,
    countryChanged: false,
    requiresAuthorityLease: false,
    executionAuthorized: false,
    reason,
  };
}

function validActiveSession(session: FcrSessionState, now: string): TrustDecision['reason'] | null {
  if (!session.sessionId.trim() || !session.actorId.trim() || session.sessionVersion < 1) {
    return 'session-invalid';
  }

  const issuedAt = timestamp(session.issuedAt);
  const expiresAt = timestamp(session.expiresAt);
  const lastSeenAt = timestamp(session.lastSeenAt);
  const nowMs = timestamp(now);
  if (issuedAt === null || expiresAt === null || lastSeenAt === null || nowMs === null) {
    return 'session-invalid';
  }
  if (expiresAt <= issuedAt || lastSeenAt < issuedAt || nowMs < issuedAt) {
    return 'session-invalid';
  }
  if (session.trustState === 'revoked' || session.revokedAt) {
    return 'session-revoked';
  }
  if (expiresAt <= nowMs) {
    return 'session-expired';
  }
  return null;
}

/**
 * Deterministically classify continuity for an already-authenticated session.
 *
 * This function never authenticates an actor and never authorizes execution.
 * ASN and country are surfaced as L99 evidence only. A network change cannot
 * change the binding match or revoke an otherwise valid session.
 */
export function evaluateTrustPolicy(input: EvaluateTrustInput): TrustDecision {
  if (!input.session) return revokedDecision('session-missing');

  const invalidReason = validActiveSession(input.session, input.now);
  if (invalidReason) return revokedDecision(invalidReason);

  const evidence = input.evidence;
  const asnChanged = networkEvidenceChanged(evidence?.currentAsn, evidence?.priorAsn);
  const countryChanged = networkEvidenceChanged(evidence?.currentCountry, evidence?.priorCountry);

  const bindingMatched = input.session.fingerprintVersion === FINGERPRINT_VERSION
    && input.observation.version === FINGERPRINT_VERSION
    && FPV1_BINDING_PATTERN.test(input.session.fingerprintBinding)
    && FPV1_BINDING_PATTERN.test(input.observation.binding ?? '')
    && input.session.fingerprintBinding === input.observation.binding;

  const continuityDrifted = input.session.trustState === 'drifted' || !bindingMatched;
  if (continuityDrifted && input.actionRisk === 'high-impact') {
    return {
      continuity: 'DRIFTED',
      verdict: 'STEP_UP_REQUIRED',
      bindingMatched,
      asnChanged,
      countryChanged,
      requiresAuthorityLease: true,
      executionAuthorized: false,
      reason: 'step-up-required',
    };
  }

  if (continuityDrifted) {
    return {
      continuity: 'DRIFTED',
      verdict: 'DRIFTED',
      bindingMatched,
      asnChanged,
      countryChanged,
      requiresAuthorityLease: false,
      executionAuthorized: false,
      reason: 'continuity-drift',
    };
  }

  return {
    continuity: 'TRUSTED',
    verdict: 'TRUSTED',
    bindingMatched: true,
    asnChanged,
    countryChanged,
    requiresAuthorityLease: input.actionRisk === 'high-impact',
    executionAuthorized: false,
    reason: 'active-binding-match',
  };
}
