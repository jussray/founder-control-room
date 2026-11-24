import { describe, expect, it } from 'vitest';
import { relayBetweenOperators } from '../operatorRelayBridge.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';

describe('relayBetweenOperators', () => {
  it('round-trips a founder-delegated review to the requested peer operator', async () => {
    const result = await relayBetweenOperators({
      fromOperator: 'codex',
      toOperator: 'perplexity',
      capability: 'review',
      goal: 'Attack the ULTRATHINK bridge.',
      contextSummary: 'Current bridge design and identified risks.',
      sourceRef: 'chat:current',
      now: new Date('2026-09-16T06:30:00.000Z'),
    }, {
      perplexity: async (request) => buildOperatorRelayResponse(request, {
        answer: 'Independent attack complete.',
        evidenceRefs: ['provider:perplexity:test-receipt'],
        completedAt: '2026-09-16T06:31:00.000Z',
      }),
    });

    expect(result.request.toOperator).toBe('perplexity');
    expect(result.response.fromOperator).toBe('perplexity');
    expect(result.response.requestHash).toBe(result.request.requestHash);
  });
});
