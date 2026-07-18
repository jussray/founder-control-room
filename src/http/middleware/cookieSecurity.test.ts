import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireSameOriginForCookieMutation } from './cookieSecurity.js';

function app() {
  const instance = express();
  instance.use(requireSameOriginForCookieMutation);
  instance.post('/mutate', (_req, res) => res.status(204).end());
  return instance;
}

describe('cookie-authenticated mutation guard', () => {
  it('rejects a cross-site mutation carrying the founder cookie', async () => {
    const response = await request(app())
      .post('/mutate')
      .set('Cookie', 'fcr_session=opaque')
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Cross-site/);
  });

  it('allows a same-origin mutation carrying the founder cookie', async () => {
    const response = await request(app())
      .post('/mutate')
      .set('Cookie', 'fcr_session=opaque')
      .set('Origin', 'http://localhost:8787')
      .set('Sec-Fetch-Site', 'same-origin');

    expect(response.status).toBe(204);
  });

  it('keeps stateless Bearer clients independent from browser Origin', async () => {
    const response = await request(app())
      .post('/mutate')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(204);
  });
});
