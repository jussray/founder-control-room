import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

type SecurityModule = typeof import('../security.js');

async function loadFreshSecurity(): Promise<SecurityModule> {
  vi.resetModules();
  return import('../security.js');
}

function createProbeApp(limiter: express.RequestHandler) {
  const app = express();
  app.use(limiter);
  app.get('/read', (_req, res) => res.status(200).json({ ok: true }));
  app.post('/write', (_req, res) => res.status(204).end());
  return app;
}

describe('security rate limiting', () => {
  it('keeps general read and write budgets independent while preserving 60/min caps', async () => {
    const { rateLimitGeneral } = await loadFreshSecurity();
    const app = createProbeApp(rateLimitGeneral);

    for (let index = 0; index < 60; index += 1) {
      const response = await request(app).post('/write');
      expect(response.status).toBe(204);
    }

    const readAfterWrites = await request(app).get('/read');
    expect(readAfterWrites.status).toBe(200);
    expect(readAfterWrites.headers['ratelimit-remaining']).toBe('59');

    const blockedWrite = await request(app).post('/write');
    expect(blockedWrite.status).toBe(429);
    expect(blockedWrite.body).toEqual({ error: 'Rate limit exceeded.' });

    for (let index = 1; index < 60; index += 1) {
      const response = await request(app).get('/read');
      expect(response.status).toBe(200);
    }

    const blockedRead = await request(app).get('/read');
    expect(blockedRead.status).toBe(429);
    expect(blockedRead.body).toEqual({ error: 'Rate limit exceeded.' });
  });

  it('preserves the five-request magic-link limit', async () => {
    const { rateLimitMagicLink } = await loadFreshSecurity();
    const app = express();
    app.use(rateLimitMagicLink);
    app.post('/magic-link', (_req, res) => res.status(204).end());

    for (let index = 0; index < 5; index += 1) {
      const response = await request(app).post('/magic-link');
      expect(response.status).toBe(204);
    }

    const blocked = await request(app).post('/magic-link');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: 'Too many magic-link requests, please try again later.',
    });
  });
});
