import type { OperatorRelayRequestV1 } from './operatorRelay.js';

export function relayMayDispatch(request: OperatorRelayRequestV1): boolean {
  return request.fromOperator !== request.toOperator &&
    request.authority.externalWrite === false &&
    request.authority.merge === false &&
    request.authority.deploy === false &&
    request.authority.publish === false &&
    request.authority.providerMutation === false;
}
