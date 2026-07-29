import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createFounderSignalEngineMcpAuth } from '../founderSignalEngineMcpAuth.js';

function buildApp(env: NodeJS.ProcessEnv) {
  const app = express();
  app.use(express.json());
  app.post('/mcp', createFounderSignalEngineMcpAuth({ env }), (_req, res) => {
    res.status(204).send();
  });
  return app;
}

const body = {
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/list',
  params: {},
};

describe('Founder Signal Engine MCP pre-policy authentication', () => {
  it('fails closed before middleware side effects when the token is not configured', async () => {
    const response = await request(buildApp({})).post('/mcp').send(body);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      id: 7,
      error: {
        code: -32001,
        message: 'Founder Signal Engine MCP token is not configured',
      },
    });
  });

  it('rejects missing and incorrect bearer credentials', async () => {
    const app = buildApp({ FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: 'server-held-token' });

    const missing = await request(app).post('/mcp').send(body);
    const incorrect = await request(app)
      .post('/mcp')
      .set('authorization', 'Bearer wrong-token')
      .send(body);

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(incorrect.body.error).toMatchObject({ code: -32000, message: 'Unauthorized' });
  });

  it('allows an exact bearer token to continue to the policy gate', async () => {
    const response = await request(
      buildApp({ FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: 'server-held-token' }),
    )
      .post('/mcp')
      .set('authorization', 'Bearer server-held-token')
      .send(body);

    expect(response.status).toBe(204);
  });
});
