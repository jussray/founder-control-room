import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { mcpRouter } from '../mcp.js';

describe('remote MCP shared authorization rate limit', () => {
  it('shares one 60/min per-IP budget between canonical and compatibility routes', async () => {
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    app.use('/mcp', mcpRouter);

    // Authentication is intentionally omitted. Each response must still pass
    // through the local limiter, before bearer/OAuth/static credential choice.
    for (let i = 0; i < 60; i += 1) {
      const url = i % 2 === 0 ? '/mcp' : '/mcp/read';
      const response = await request(app)
        .post(url)
        .send({ jsonrpc: '2.0', id: i + 1, method: 'initialize' });
      expect(response.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post('/mcp/read')
      .send({ jsonrpc: '2.0', id: 61, method: 'initialize' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      error: 'Too many MCP requests. Please retry shortly.',
    });
  }, 20_000);
});
