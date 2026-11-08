import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from './operatorRelay.js';

export function relayOutcomeVerified(request: OperatorRelayRequestV1, response: OperatorRelayResponseV1): boolean {
  return response.status === 'completed' &&
    request.toOperator === response.fromOperator &&
    request.requestHash === response.requestHash &&
    response.evidenceRefs.some((ref) => ref.trim().length > 0);
}
