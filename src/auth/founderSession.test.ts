import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { clearFounderSession, writeFounderSession } from './founderSession.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('founder session cookie', () => {
  it('uses a production __Host cookie with no-store response headers', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.get('/set', (_req, res) => {
      writeFounderSession(res, {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: 2_000_000_000,
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'founder-user' },
      } as never);
      res.status(204).end();
    });

    const response = await request(app).get('/set');
    const cookie = response.headers['set-cookie']?.[0] ?? '';

    expect(cookie).toContain('__Host-fcr_session=');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Priority=High');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers.expires).toBe('0');
  });

  it('clears both production and localhost cookie names', async () => {
    const app = express();
    app.post('/clear', (_req, res) => {
      clearFounderSession(res);
      res.status(204).end();
    });

    const response = await request(app).post('/clear');
    const cookies = response.headers['set-cookie'] ?? [];

    expect(cookies).toHaveLength(2);
    expect(cookies.some((cookie: string) => cookie.startsWith('__Host-fcr_session='))).toBe(true);
    expect(cookies.some((cookie: string) => cookie.startsWith('fcr_session='))).toBe(true);
    expect(cookies.every((cookie: string) => cookie.includes('Max-Age=0'))).toBe(true);
  });
});
