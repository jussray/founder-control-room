import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function buildApp() {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.FOUNDER_API_URL = 'https://control.example.com';
  const { requireSameOriginBrowserMutation } = await import('../csrf.js');
  const app = express();
  app.use(requireSameOriginBrowserMutation);
  app.all('/mutation', (_req, res) => res.json({ ok: true }));
  app.all('/mcp', (_req, res) => res.json({ reachedMcp: true }));
  app.all('/mcp/read', (_req, res) => res.json({ reachedMcpRead: true }));
  return app;
}

describe('same-origin browser mutation gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows safe reads without an Origin header', async () => {
    const response = await request(await buildApp()).get('/mutation');
    expect(response.status).toBe(200);
  });

  it('allows explicit Bearer automation without a browser Origin', async () => {
    const response = await request(await buildApp())
      .post('/mutation')
      .set('Authorization', 'Bearer explicit-agent-token');
    expect(response.status).toBe(200);
  });

  it('allows the exact unauthenticated POST /mcp OAuth bootstrap to reach its bearer challenge handler', async () => {
    const response = await request(await buildApp())
      .post('/mcp')
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reachedMcp: true });
  });

  it('does not widen the OAuth bootstrap exemption to the static-token compatibility lane', async () => {
    const response = await request(await buildApp())
      .post('/mcp/read')
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Same-origin browser request required');
  });

  it('allows an exact same-origin browser mutation', async () => {
    const response = await request(await buildApp())
      .post('/mutation')
      .set('Origin', 'https://control.example.com')
      .set('Sec-Fetch-Site', 'same-origin');
    expect(response.status).toBe(200);
  });

  it('rejects a cross-origin cookie-authenticated mutation', async () => {
    const response = await request(await buildApp())
      .post('/mutation')
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Cookie', 'fcr_session=automatic-browser-cookie');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Same-origin browser request required');
  });

  it('rejects a same-site subdomain because the UI is same-origin only', async () => {
    const response = await request(await buildApp())
      .post('/mutation')
      .set('Origin', 'https://other.control.example.com')
      .set('Sec-Fetch-Site', 'same-site');
    expect(response.status).toBe(403);
  });
});
