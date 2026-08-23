import type { MainEvidenceReasonV0, MainEvidenceStateV0 } from './main-evidence-decision.v0.js';

export type ContinuityTransitionV0 = {
  kind: 'continuity-transition.v0';
  repo: string;
  fromState?: MainEvidenceStateV0;
  toState: MainEvidenceStateV0;
  fromAuthoritativeSha?: string;
  toAuthoritativeSha?: string;
  reason: MainEvidenceReasonV0;
  changedAt: string;
  correlationId: string;
};
