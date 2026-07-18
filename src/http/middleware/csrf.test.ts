import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireSameOriginBrowserMutation } from './csrf.js';

function app() {
  const instance = express();
  instance.use(requireSameOriginBrowserMutation);
  instance.post('/mutate', (_req, res) => res.status(204).end());
  return instance;
}

describe('same-origin browser mutation guard', () => {
  it('rejects a cross-site browser mutation', async () => {
    const response = await request(app())
      .post('/mutate')
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Same-origin/);
  });

  it('allows the configured same-origin browser mutation', async () => {
    const response = await request(app())
      .post('/mutate')
      .set('Origin', 'http://localhost:8787')
      .set('Sec-Fetch-Site', 'same-origin');

    expect(response.status).toBe(204);
  });

  it('keeps explicit Bearer clients independent from ambient browser cookies', async () => {
    const response = await request(app())
      .post('/mutate')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(204);
  });
});
