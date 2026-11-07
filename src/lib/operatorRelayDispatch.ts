import type { OperatorRelayRequestV1, OperatorRelayResponseV1, RelayOperatorId } from './operatorRelay.js';
import { validateOperatorRelayRequest, validateOperatorRelayResponse } from './operatorRelay.js';
import { createServerMuseRelayAdapter } from './operatorRelayMuseProvider.js';
import { relayMayDispatch } from './operatorRelayPolicy.js';

export type OperatorRelayAdapter = (request: OperatorRelayRequestV1) => Promise<OperatorRelayResponseV1>;

export interface OperatorRelayAdapters {
  gemini?: OperatorRelayAdapter;
  codex?: OperatorRelayAdapter;
  'claude-code'?: OperatorRelayAdapter;
  perplexity?: OperatorRelayAdapter;
  deepseek?: OperatorRelayAdapter;
  muse?: OperatorRelayAdapter;
}

export class OperatorRelayDispatchError extends Error {
  constructor(
    public readonly code:
      | 'relay_request_invalid'
      | 'relay_target_unavailable'
      | 'relay_response_invalid'
      | 'relay_disclosure_denied',
    message: string,
  ) {
    super(message);
    this.name = 'OperatorRelayDispatchError';
  }
}

export async function dispatchOperatorRelay(
  request: OperatorRelayRequestV1,
  adapters: OperatorRelayAdapters,
  nowMs = Date.now(),
): Promise<OperatorRelayResponseV1> {
  const requestErrors = validateOperatorRelayRequest(request, nowMs);
  if (requestErrors.length > 0) {
    throw new OperatorRelayDispatchError('relay_request_invalid', requestErrors.join('; '));
  }

  // This is the common trust boundary, including injected/custom adapters.
  // No provider call may receive restricted context or malformed authority.
  if (!relayMayDispatch(request)) {
    throw new OperatorRelayDispatchError(
      'relay_disclosure_denied',
      'relay context is not authorized for external operator dispatch',
    );
  }

  // Own-property lookup only: toOperator is allowlist-validated above, and this
  // keeps inherited keys (e.g. __proto__) from ever resolving to a callable.
  const adapter = (Object.hasOwn(adapters, request.toOperator) ? adapters[request.toOperator as RelayOperatorId] : undefined)
    ?? (request.toOperator === 'muse' ? createServerMuseRelayAdapter() : undefined);
  if (!adapter) {
    throw new OperatorRelayDispatchError(
      'relay_target_unavailable',
      `requested operator ${request.toOperator} is not connected to a relay adapter`,
    );
  }

  const response = await adapter(request);
  const responseErrors = validateOperatorRelayResponse(response, request);
  if (responseErrors.length > 0) {
    throw new OperatorRelayDispatchError('relay_response_invalid', responseErrors.join('; '));
  }
  return response;
}
