import { describe, expect, it } from 'vitest';
import { operatorRelayAdapterFromTextProvider } from '../operatorRelayProvider.js';
import type { OperatorRelayRequestV1 } from '../operatorRelay.js';

describe('operatorRelayAdapterFromTextProvider', () => {
  it('returns provider evidence with the bound operator response', async () => {
    const adapter = operatorRelayAdapterFromTextProvider({
      invoke: async ({ goal, context }) => ({ text: `${goal} :: ${context}`, evidenceRef: 'provider:test:1' }),
    });
    const request = {
      relayId: 'r',
      requestHash: 'a'.repeat(64),
      fromOperator: 'codex',
      toOperator: 'perplexity',
      goal: 'review',
      context: { summary: 'context' },
    } as OperatorRelayRequestV1;
    const response = await adapter(request);
    expect(response.fromOperator).toBe('perplexity');
    expect(response.evidenceRefs).toEqual(['provider:test:1']);
  });
});
