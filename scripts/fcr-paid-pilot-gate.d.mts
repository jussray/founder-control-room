export interface PilotCandidate {
  kind: 'fcr_non_chargeable_pilot_candidate';
  executionId: string;
  artifactDigest: string;
  paymentStatus: 'not_charged';
  productionAuthorized: false;
  deliveryVerified: false;
  evidenceOrigin: 'caller_supplied_unverified';
  independentlyVerified: false;
}
// Fails closed: no variant allows. A candidate is not a receipt.
export type PilotDecision = { allowed: false; reason: string; candidate?: PilotCandidate };
export function assessPilotExecution(input: Record<string, unknown>): PilotDecision;
