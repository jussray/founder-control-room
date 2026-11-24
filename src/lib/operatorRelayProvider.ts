import type { OperatorRelayAdapter } from './operatorRelayDispatch.js';
import type { OperatorRelayRequestV1, OperatorRelayUsageV1 } from './operatorRelay.js';
import { buildOperatorRelayResponse } from './operatorRelayProviderResult.js';

export type OperatorRelayExternalProvider =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'perplexity'
  | 'deepseek'
  | 'muse';

export class OperatorRelayProviderBoundaryError extends Error {
  readonly externalProviderCall = true as const;

  constructor(
    public readonly provider: OperatorRelayExternalProvider,
    message: string,
  ) {
    super(message);
    this.name = 'OperatorRelayProviderBoundaryError';
  }
}

export interface TextOperatorProvider {
  invoke(input: {
    request: OperatorRelayRequestV1;
    goal: string;
    context: string;
  }): Promise<{
    text: string;
    evidenceRef: string;
    usage?: OperatorRelayUsageV1;
  }>;
}

export function operatorRelayAdapterFromTextProvider(provider: TextOperatorProvider): OperatorRelayAdapter {
  return async (request) => {
    const result = await provider.invoke({
      request,
      goal: request.goal,
      context: request.context.summary,
    });
    return buildOperatorRelayResponse(request, {
      answer: result.text,
      evidenceRefs: [result.evidenceRef],
      usage: result.usage,
    });
  };
}
