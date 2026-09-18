import {
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayResponseHash,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
} from './operatorRelay.js';

export function buildOperatorRelayResponse(
  request: OperatorRelayRequestV1,
  input: {
    answer: string;
    evidenceRefs?: string[];
    unresolved?: string[];
    status?: OperatorRelayResponseV1['status'];
    completedAt?: string;
  },
): OperatorRelayResponseV1 {
  const base: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: request.relayId,
    requestHash: request.requestHash,
    fromOperator: request.toOperator,
    toOperator: request.fromOperator,
    status: input.status ?? 'completed',
    answer: input.answer,
    evidenceRefs: input.evidenceRefs ?? [],
    unresolved: input.unresolved ?? [],
    authorityRequested: 'none',
    completedAt: input.completedAt ?? new Date().toISOString(),
  };
  return { ...base, responseHash: operatorRelayResponseHash(base) };
}
