export type OperatorRelayTruth = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'UNKNOWN';

export function classifyOperatorRelayTruth(input: {
  contractTests: boolean;
  authenticatedRoute: boolean;
  realProviderDispatch: boolean;
  boundProviderReceipt: boolean;
  playwrightRoundTrip: boolean;
}): OperatorRelayTruth {
  if (!input.contractTests) return 'UNKNOWN';
  if (!input.authenticatedRoute || !input.realProviderDispatch) return 'PARTIAL';
  if (!input.boundProviderReceipt || !input.playwrightRoundTrip) return 'PARTIAL';
  return 'VERIFIED';
}
