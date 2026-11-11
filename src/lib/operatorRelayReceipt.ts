import { createHash } from 'node:crypto';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from './operatorRelay.js';

export const OPERATOR_RELAY_RECEIPT_CONTRACT = 'juss/operator-relay/receipt@v1' as const;

export interface OperatorRelayReceiptV1 {
  contract: typeof OPERATOR_RELAY_RECEIPT_CONTRACT;
  relayId: string;
  requestHash: string;
  responseHash: string;
  requestedOperator: OperatorRelayRequestV1['toOperator'];
  respondingOperator: OperatorRelayResponseV1['fromOperator'];
  providerEvidenceRef: string;
  completedAt: string;
  receiptHash: string;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildOperatorRelayReceipt(
  request: OperatorRelayRequestV1,
  response: OperatorRelayResponseV1,
  providerEvidenceRef: string,
): OperatorRelayReceiptV1 {
  if (request.toOperator !== response.fromOperator) {
    throw new Error('relay receipt operator mismatch');
  }
  const identity = [
    OPERATOR_RELAY_RECEIPT_CONTRACT,
    request.relayId,
    request.requestHash,
    response.responseHash,
    request.toOperator,
    response.fromOperator,
    providerEvidenceRef.trim(),
    response.completedAt,
  ];
  return {
    contract: OPERATOR_RELAY_RECEIPT_CONTRACT,
    relayId: request.relayId,
    requestHash: request.requestHash,
    responseHash: response.responseHash,
    requestedOperator: request.toOperator,
    respondingOperator: response.fromOperator,
    providerEvidenceRef: providerEvidenceRef.trim(),
    completedAt: response.completedAt,
    receiptHash: digest(identity),
  };
}
