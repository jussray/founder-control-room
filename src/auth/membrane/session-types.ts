export const FINGERPRINT_VERSION = 'fpv1' as const;

export type FingerprintVersion = typeof FINGERPRINT_VERSION;
export type SessionTrustState = 'trusted' | 'drifted' | 'revoked';
export type TrustContinuity = 'TRUSTED' | 'DRIFTED' | 'REVOKED';
export type TrustVerdict = TrustContinuity | 'STEP_UP_REQUIRED';
export type FcrActionRisk = 'read' | 'proposal' | 'high-impact';

/**
 * Pure trust-policy view of an authoritative server-side FCR session.
 *
 * The runtime adapter owns cookie parsing, persistence, rotation, revocation,
 * authentication, and provider I/O. This object carries only explicit inputs
 * needed to evaluate continuity and action risk.
 */
export interface FcrSessionState {
  sessionId: string;
  actorId: string;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  fingerprintVersion: FingerprintVersion;
  fingerprintBinding: string;
  trustState: SessionTrustState;
  sessionVersion: number;
  lastTrustedAt?: string;
  revokedAt?: string;
  revokeReason?: string;
}

/** Current privacy-minimized continuity observation supplied by the adapter. */
export interface FingerprintObservation {
  version: FingerprintVersion | string;
  binding: string | null;
}

/**
 * L99 network context is evidence only. These values never participate in the
 * fingerprint binding comparison and never grant authority.
 *
 * Raw IP and exact geolocation are intentionally absent from this contract.
 */
export interface L99ContinuityEvidence {
  observedAt: string;
  currentAsn?: number | null;
  priorAsn?: number | null;
  currentCountry?: string | null;
  priorCountry?: string | null;
  signalAvailability?: readonly string[];
}

export interface EvaluateTrustInput {
  session: FcrSessionState | null;
  observation: FingerprintObservation;
  evidence?: L99ContinuityEvidence;
  actionRisk: FcrActionRisk;
  now: string;
}

export interface TrustDecision {
  continuity: TrustContinuity;
  verdict: TrustVerdict;
  bindingMatched: boolean;
  asnChanged: boolean;
  countryChanged: boolean;
  requiresAuthorityLease: boolean;
  executionAuthorized: false;
  reason:
    | 'active-binding-match'
    | 'continuity-drift'
    | 'step-up-required'
    | 'session-missing'
    | 'session-invalid'
    | 'session-expired'
    | 'session-revoked';
}
