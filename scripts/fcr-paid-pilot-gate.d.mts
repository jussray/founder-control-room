export interface PilotReceipt {
  kind: 'fcr_non_chargeable_pilot';
  executionId: string;
  artifactDigest: string;
  paymentStatus: 'not_charged';
  productionAuthorized: false;
  deliveryVerified: false;
  evidenceOrigin: 'caller_supplied_unverified';
  independentlyVerified: false;
}
export type PilotDecision =
  | { allowed: false; reason: string; receipt?: never }
  | { allowed: true; reason: string; receipt: PilotReceipt };
export function assessPilotExecution(input: Record<string, unknown>): PilotDecision;
