import { describe, expect, it } from 'vitest';
import { runLiveCouncilRelay } from '../councilRelay.js';
import type { OperatorRelayRequestV1 } from '../operatorRelay.js';
import type { OperatorRelayAdapter } from '../operatorRelayDispatch.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';

function seat(answer: string, evidenceRef: string, seen: OperatorRelayRequestV1[]): OperatorRelayAdapter {
  return async (request) => {
    seen.push(request);
    return buildOperatorRelayResponse(request, { answer, evidenceRefs: [evidenceRef] });
  };
}

describe('runLiveCouncilRelay', () => {
  it('starts from FCR and passes a completed contribution to the next provider', async () => {
    const seen: OperatorRelayRequestV1[] = [];
    const result = await runLiveCouncilRelay({
      goal: 'Return one focused recommendation.',
      contextSummary: 'Run a provider Council round automatically.',
      participants: ['codex', 'claude-code'],
    }, {
      codex: seat('Codex contribution', 'provider:openai:resp-1', seen),
      'claude-code': seat('Claude contribution', 'provider:anthropic:msg-2', seen),
    });

    expect(result.status).toBe('completed');
    expect(seen).toHaveLength(2);
    expect(seen[0]?.fromOperator).toBe('fcr');
    expect(seen[0]?.toOperator).toBe('codex');
    expect(seen[1]?.fromOperator).toBe('codex');
    expect(seen[1]?.toOperator).toBe('claude-code');
    expect(seen[1]?.context.summary).toContain('codex: Codex contribution');
    expect(result.finalAnswer).toBe('Claude contribution');
  });

  it('records an unavailable provider and continues from FCR to a working provider', async () => {
    const seen: OperatorRelayRequestV1[] = [];
    const result = await runLiveCouncilRelay({
      goal: 'Return one bounded Council recommendation.',
      contextSummary: 'A configured provider may be unavailable.',
      participants: ['gemini', 'codex'],
    }, {
      codex: seat('Codex answered', 'provider:openai:resp-3', seen),
    });

    expect(result.status).toBe('partial');
    expect(result.blockedParticipants).toEqual(['gemini']);
    expect(result.completedParticipants).toEqual(['codex']);
    expect(result.hops[0]).toMatchObject({ seat: 'gemini', source: 'fcr', status: 'failed', failureCode: 'relay_target_unavailable' });
    expect(seen[0]?.fromOperator).toBe('fcr');
    expect(seen[0]?.toOperator).toBe('codex');
  });
});
