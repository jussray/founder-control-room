import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from './operatorRelay.js';

export interface OperatorRelayContinuity {
  requestHash: string;
  responseHash: string;
  subject: string;
  requestedOperator: string;
  respondingOperator: string;
}

export function relayContinuity(request: OperatorRelayRequestV1, response: OperatorRelayResponseV1): OperatorRelayContinuity {
  return {
    requestHash: request.requestHash,
    responseHash: response.responseHash,
    subject: request.context.sourceFingerprint,
    requestedOperator: request.toOperator,
    respondingOperator: response.fromOperator,
  };
}
