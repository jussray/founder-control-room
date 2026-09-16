import type { OperatorRelayAdapter } from './operatorRelayDispatch.js';
import { buildOperatorRelayResponse } from './operatorRelayProviderResult.js';

export interface TextOperatorProvider {
  invoke(input: { goal: string; context: string }): Promise<{
    text: string;
    evidenceRef: string;
  }>;
}

export function operatorRelayAdapterFromTextProvider(provider: TextOperatorProvider): OperatorRelayAdapter {
  return async (request) => {
    const result = await provider.invoke({
      goal: request.goal,
      context: request.context.summary,
    });
    return buildOperatorRelayResponse(request, {
      answer: result.text,
      evidenceRefs: [result.evidenceRef],
    });
  };
}
