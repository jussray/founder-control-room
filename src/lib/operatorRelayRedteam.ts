import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from './operatorRelay.js';

export function redteamRelayPair(request: OperatorRelayRequestV1, response: OperatorRelayResponseV1): string[] {
  const failures: string[] = [];
  if (request.toOperator !== response.fromOperator) failures.push('operator substitution detected');
  if (request.requestHash !== response.requestHash) failures.push('request binding mismatch');
  if (response.toOperator !== request.fromOperator) failures.push('return route mismatch');
  if (response.status === 'completed' && response.evidenceRefs.length === 0) failures.push('completed response lacks provider evidence');
  return failures;
}
