import express from 'express';
import request from 'supertest';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { clearFounderSession, writeFounderSession } from '../founderSession.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 2_000_000_000,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'founder-user' },
} as Session;

describe('founder session cookie', () => {
  it('uses a production __Host cookie with no-store response headers', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.get('/set', (_req, res) => {
      writeFounderSession(res, session);
      res.status(204).end();
    });

    const response = await request(app).get('/set');
    const cookie = response.headers['set-cookie']?.[0] ?? '';

    expect(cookie).toContain('__Host-fcr_session=');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Priority=High');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers.expires).toBe('0');
  });

  it('uses the localhost cookie name without Secure in development', async () => {
    process.env.NODE_ENV = 'development';
    const app = express();
    app.get('/set', (_req, res) => {
      writeFounderSession(res, session);
      res.status(204).end();
    });

    const response = await request(app).get('/set');
    const cookie = response.headers['set-cookie']?.[0] ?? '';

    expect(cookie).toContain('fcr_session=');
    expect(cookie).not.toContain('__Host-');
    expect(cookie).not.toContain('Secure');
  });

  it('clears both production and localhost cookie names', async () => {
    const app = express();
    app.post('/clear', (_req, res) => {
      clearFounderSession(res);
      res.status(204).end();
    });

    const response = await request(app).post('/clear');
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);

    expect(cookies).toHaveLength(2);
    expect(cookies.some((cookie: string) => cookie.startsWith('__Host-fcr_session='))).toBe(true);
    expect(cookies.some((cookie: string) => cookie.startsWith('fcr_session='))).toBe(true);
    expect(cookies.every((cookie: string) => cookie.includes('Max-Age=0'))).toBe(true);
  });
});
