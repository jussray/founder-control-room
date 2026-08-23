import type { MainEvidenceReasonV0, MainEvidenceStateV0 } from './main-evidence-decision.v0.js';

export type VerificationProjectionV0 = {
  kind: 'verification-projection.v0';
  repo: string;
  authoritativeSha?: string;
  lastVerifiedSha?: string;
  state: MainEvidenceStateV0;
  reason: MainEvidenceReasonV0;
  missingWitnessIds: readonly string[];
  summary: string;
  promotionBlocked: boolean;
  evaluatedAt: string;
  correlationId: string;
};
