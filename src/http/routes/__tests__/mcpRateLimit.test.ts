import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { rateLimitExternalMcp } from '../../middleware/mcpRateLimit.js';

describe('remote MCP shared authorization rate limit', () => {
  it('shares one 60/min per-IP budget between canonical and compatibility routes', async () => {
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    // Real route identity is independently pinned by verify:served-mcp.
    // Exercise the actual shared limiter without importing any Supabase client.
    app.post('/mcp', rateLimitExternalMcp, (_req, res) => res.json({ ok: true }));
    app.post('/mcp/read', rateLimitExternalMcp, (_req, res) => res.json({ ok: true }));

    // Both aliases use the same middleware instance, not separate stores.
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
