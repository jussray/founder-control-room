import type { OperatorRelayRequestV1 } from './operatorRelay.js';

export interface RelaySessionAuthority {
  authenticated: boolean;
  operator: OperatorRelayRequestV1['fromOperator'];
}

export function authorizeOperatorRelay(session: RelaySessionAuthority, request: OperatorRelayRequestV1): string[] {
  const errors: string[] = [];
  if (!session.authenticated) errors.push('relay requires authenticated founder session');
  if (session.operator !== request.fromOperator) errors.push('relay source operator is not bound to current session');
  return errors;
}
