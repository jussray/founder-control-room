import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from './operatorRelay.js';

export function relayClaim(request: OperatorRelayRequestV1, response: OperatorRelayResponseV1): string {
  return `${request.toOperator} answered relay ${request.relayId} bound to ${request.requestHash}; response ${response.responseHash}`;
}
