import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../../../lib/operatorRelay.js';
import { createOperatorRelayRouter } from '../operatorRelay.js';

function relay(): OperatorRelayRequestV1 {
  const summary = 'Bounded relay route test.';
  const sourceRef = 'route:test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-route-1',
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: 'Prove route returns a response from the requested operator only.',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'internal',
    createdAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('operator relay HTTP route', () => {
  it('returns the requested operator response', async () => {
    const app = express();
    app.use(express.json());
    app.use(createOperatorRelayRouter({
      perplexity: async (incoming) => {
        const base = {
          contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
          relayId: incoming.relayId,
          requestHash: incoming.requestHash,
          fromOperator: 'perplexity' as const,
          toOperator: 'codex' as const,
          status: 'completed' as const,
          answer: 'relay ok',
          evidenceRefs: ['provider:test'],
          unresolved: [],
          authorityRequested: 'none' as const,
          completedAt: new Date().toISOString(),
        };
        return { ...base, responseHash: operatorRelayResponseHash(base) };
      },
    }));

    const response = await request(app).post('/api/operator-relay').send(relay());
    expect(response.status).toBe(200);
    expect(response.body.fromOperator).toBe('perplexity');
  });

  it('fails closed when the requested operator is unavailable', async () => {
    const app = express();
    app.use(express.json());
    app.use(createOperatorRelayRouter({}));

    const response = await request(app).post('/api/operator-relay').send(relay());
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('relay_target_unavailable');
  });
});
