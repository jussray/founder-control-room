import type { OperatorRelayRequestV1 } from './operatorRelay.js';

export function relayMayDispatch(request: OperatorRelayRequestV1): boolean {
  const authority = request.authority;
  // Provider-specific checks do not cover custom relay adapters. Deny before
  // selecting ANY adapter; a sensitivity label is not disclosure approval.
  const fields = ['externalWrite', 'merge', 'deploy', 'publish', 'providerMutation'] as const;
  return request.fromOperator !== request.toOperator &&
    (request.sensitivity === 'public' || request.sensitivity === 'internal') &&
    authority !== null && typeof authority === 'object' && !Array.isArray(authority) &&
    Object.keys(authority).length === fields.length &&
    fields.every((field) => authority[field] === false);
}
