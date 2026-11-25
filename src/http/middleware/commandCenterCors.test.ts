import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { corsMiddleware, errorHandler } from './security.js';

const site = 'https://fcr-command-center.jussray.chatgpt.site';
function app() {
  const server = express();
  server.use(corsMiddleware);
  server.get('/site/command-center/bootstrap', (_req, res) => res.json({ ok: true }));
  server.get('/projects', (_req, res) => res.json({ ok: true }));
  server.post('/site/command-center/bootstrap', (_req, res) => res.json({ ok: true }));
  server.use(errorHandler);
  return server;
}

describe('site-specific least-privilege CORS', () => {
  beforeEach(() => {
    process.env.FCR_COMMAND_CENTER_SITE_ENABLED = 'true';
    process.env.FCR_COMMAND_CENTER_SITE_ORIGIN = site;
  });
  afterEach(() => {
    delete process.env.FCR_COMMAND_CENTER_SITE_ENABLED;
    delete process.env.FCR_COMMAND_CENTER_SITE_ORIGIN;
  });
  it('allows verified Site origin on bootstrap GET without cookie credentials', async () => {
    const res = await request(app()).get('/site/command-center/bootstrap').set('Origin', site);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(site);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers.vary).toContain('Origin');
  });
  it('preflight allows only GET and Authorization', async () => {
    const res = await request(app()).options('/site/command-center/bootstrap').set('Origin', site);
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBe('GET,OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Authorization');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
  it('site origin cannot access other APIs or mutate bootstrap route', async () => {
    expect((await request(app()).get('/projects').set('Origin', site)).status).toBe(403);
    expect((await request(app()).post('/site/command-center/bootstrap').set('Origin', site)).status).toBe(403);
  });
  it('unverified origins or disabled Site do not inherit privileged CORS', async () => {
    expect((await request(app()).get('/site/command-center/bootstrap').set('Origin', 'https://other.example')).status).toBe(403);
    delete process.env.FCR_COMMAND_CENTER_SITE_ENABLED;
    expect((await request(app()).get('/site/command-center/bootstrap').set('Origin', site)).status).toBe(403);
  });
  it('refuses invalid or HTTP Site-origin configuration', async () => {
    process.env.FCR_COMMAND_CENTER_SITE_ORIGIN = 'http://fcr-command-center.jussray.chatgpt.site';
    expect((await request(app()).get('/site/command-center/bootstrap').set('Origin', site)).status).toBe(403);
    process.env.FCR_COMMAND_CENTER_SITE_ORIGIN = 'https://fcr-command-center.jussray.chatgpt.site/path';
    expect((await request(app()).get('/site/command-center/bootstrap').set('Origin', site)).status).toBe(403);
  });
});
