export type ProviderAuthorityDecisionStateV0 = 'VERIFIED' | 'DRIFT' | 'UNKNOWN';

export interface ProviderAuthorityExpectationV0 {
  requiresChangeRequest: boolean;
  minimumApprovals: number;
  requiresFreshApproval: boolean;
  requiresConversationResolution: boolean;
  requiresStrictEvidence: boolean;
  requiredEvidence: readonly string[];
  allowedBypassPrincipals: readonly string[];
}

export interface ProviderAuthorityObservationV0 {
  requiresChangeRequest: boolean | null;
  minimumApprovals: number | null;
  requiresFreshApproval: boolean | null;
  requiresConversationResolution: boolean | null;
  requiresStrictEvidence: boolean | null;
  requiredEvidence: readonly string[] | null;
  bypassPrincipals: readonly string[] | null;
}

export interface ProviderAuthorityBehavioralEvidenceV0 {
  blockedWithoutApproval: boolean | null;
  allowedWithApproval: boolean | null;
  staleApprovalBlocked: boolean | null;
}

export interface ProviderAuthorityEvaluationInputV0 {
  provider: string;
  resource: string;
  target: string;
  candidateSha: string;
  observedAt: string;
  expectation: ProviderAuthorityExpectationV0;
  observation: ProviderAuthorityObservationV0;
  behavior: ProviderAuthorityBehavioralEvidenceV0;
  evidenceRefs: readonly string[];
}

export interface ProviderAuthorityReceiptV0 {
  version: 0;
  provider: string;
  resource: string;
  target: string;
  candidateSha: string;
  observedAt: string;
  expectation: ProviderAuthorityExpectationV0;
  observation: ProviderAuthorityObservationV0;
  behavior: ProviderAuthorityBehavioralEvidenceV0;
  decision: {
    state: ProviderAuthorityDecisionStateV0;
    reasons: readonly string[];
  };
  evidenceRefs: readonly string[];
}
