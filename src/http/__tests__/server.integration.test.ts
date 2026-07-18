import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: vi.fn() } },
}));
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: { from: vi.fn() } }));

import request from 'supertest';
import { createServer } from '../server.js';

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
});
