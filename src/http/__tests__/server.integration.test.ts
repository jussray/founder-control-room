import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock('../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: { from: vi.fn() } }));

import request from 'supertest';
import { createServer } from '../server.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createServer', () => {
  it('responds to /health without auth', async () => {
    const res = await request(createServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('applies security headers to every response', async () => {
    const res = await request(createServer()).get('/health');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not serve the static frontend unless explicitly enabled', async () => {
    const res = await request(createServer()).get('/control-room/index.html');
    expect(res.status).toBe(404);
  });

  it('serves the static frontend when serveStatic is true', async () => {
    const res = await request(createServer({ serveStatic: true })).get('/control-room/index.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Founder Control Room');
  });

  it('rejects a cross-origin request from a non-allowlisted origin', async () => {
    const res = await request(createServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });

  it.each([
    ['broken JSON syntax', '{"goal":'],
    ['a forbidden top-level JSON primitive', '"preview"'],
  ])('returns INVALID_JSON for %s before founder authentication', async (_label, body) => {
    const res = await request(createServer())
      .post('/founder-os/preview')
      .set('Authorization', 'Bearer malformed-body-test')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      error: 'Request body must be a valid JSON object or array.',
      code: 'INVALID_JSON',
    });
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});
