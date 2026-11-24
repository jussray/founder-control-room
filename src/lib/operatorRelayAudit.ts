import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from './operatorRelay.js';

export interface RelayAuditRecord {
  relayId: string;
  requestedOperator: string;
  respondingOperator: string;
  requestHash: string;
  responseHash: string;
  evidenceRefs: string[];
}

export function operatorRelayAuditRecord(request: OperatorRelayRequestV1, response: OperatorRelayResponseV1): RelayAuditRecord {
  return {
    relayId: request.relayId,
    requestedOperator: request.toOperator,
    respondingOperator: response.fromOperator,
    requestHash: request.requestHash,
    responseHash: response.responseHash,
    evidenceRefs: [...response.evidenceRefs],
  };
}
