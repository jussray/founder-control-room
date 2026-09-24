import type { OperatorRelayAdapter } from './operatorRelayDispatch.js';
import type { OperatorRelayRequestV1 } from './operatorRelay.js';
import { buildOperatorRelayResponse } from './operatorRelayProviderResult.js';

export interface TextOperatorProvider {
  invoke(input: {
    request: OperatorRelayRequestV1;
    goal: string;
    context: string;
  }): Promise<{
    text: string;
    evidenceRef?: string;
    evidenceRefs?: string[];
  }>;
}

export function operatorRelayAdapterFromTextProvider(provider: TextOperatorProvider): OperatorRelayAdapter {
  return async (request) => {
    const result = await provider.invoke({
      request,
      goal: request.goal,
      context: request.context.summary,
    });
    const evidenceRefs = result.evidenceRefs
      ?? (result.evidenceRef ? [result.evidenceRef] : []);
    return buildOperatorRelayResponse(request, {
      answer: result.text,
      evidenceRefs,
    });
  };
}
