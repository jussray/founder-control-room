import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireFounderSignalEngineReviewOnly } from '../founderSignalEngineWriteGate.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/mcp', requireFounderSignalEngineReviewOnly, (_req, res) => {
    res.status(204).send();
  });
  return app;
}

function toolCall(argumentsValue: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'invoke_founder_signal_engine',
      arguments: argumentsValue,
    },
  };
}

describe('Founder Signal Engine review-only write gate', () => {
  it('permits OpenAI generation and review-queue actions', async () => {
    const openai = await request(buildApp())
      .post('/mcp')
      .send(toolCall({ requestedAction: 'run_openai_step', allowHubSpotWrite: false }));
    const reviewDraft = await request(buildApp())
      .post('/mcp')
      .send(toolCall({ requestedAction: 'queue_review_draft', allowHubSpotWrite: false }));

    expect(openai.status).toBe(204);
    expect(reviewDraft.status).toBe(204);
  });

  it('blocks publication even when the caller supplies approval-looking text', async () => {
    const response = await request(buildApp()).post('/mcp').send(
      toolCall({
        requestedAction: 'publish_or_send',
        allowHubSpotWrite: false,
        founderApprovalId: 'yes',
      }),
    );

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: -32003,
      message: 'Registry-backed founder approval is required',
    });
  });

  it('blocks HubSpot mutation independently of the requested action', async () => {
    const response = await request(buildApp()).post('/mcp').send(
      toolCall({
        requestedAction: 'queue_review_draft',
        allowHubSpotWrite: true,
        founderApprovalId: 'approval-looking-reference',
      }),
    );

    expect(response.status).toBe(403);
    expect(response.body.error.data).toMatchObject({
      requestedAction: 'queue_review_draft',
      allowHubSpotWrite: true,
    });
  });

  it('does not interfere with MCP initialization and discovery calls', async () => {
    const response = await request(buildApp()).post('/mcp').send({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {},
    });

    expect(response.status).toBe(204);
  });
});
