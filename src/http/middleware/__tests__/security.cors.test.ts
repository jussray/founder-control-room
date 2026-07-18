/**
 * CORS middleware unit tests.
 *
 * Exercises the exported middleware through Express instead of depending on
 * private implementation fields from the cors package.
 *
 * Run: npx vitest run src/http/middleware/__tests__/security.cors.test.ts
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

type SecurityModule = typeof import('../security.js');

const ENV_KEYS = [
  'NODE_ENV',
  'FOUNDER_ALLOWED_ORIGINS',
  'FOUNDER_API_URL',
] as const;

async function loadSecurityWithEnv(
  env: Record<string, string | undefined>,
): Promise<SecurityModule> {
  const saved = new Map<string, string | undefined>();

  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
  }

  for (const key of ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(env, 'NODE_ENV')) {
    process.env.NODE_ENV = 'test';
  }

  vi.resetModules();

  try {
    return await import('../security.js');
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function probe(
  env: Record<string, string | undefined>,
  origin?: string,
) {
  const security = await loadSecurityWithEnv(env);
  const app = express();

  app.use(security.corsMiddleware);
  app.get('/probe', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(security.errorHandler);

  const pending = request(app).get('/probe');
  if (origin !== undefined) pending.set('Origin', origin);
  return pending;
}

describe('CORS origin resolution', () => {
  describe('development defaults', () => {
    it('allows http://localhost:3000', async () => {
      const response = await probe({}, 'http://localhost:3000');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('allows http://localhost:8787', async () => {
      const response = await probe({}, 'http://localhost:8787');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8787');
    });

    it('denies a random external origin', async () => {
      const response = await probe({}, 'https://evil.example.com');
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CORS: origin not allowed');
    });
  });

  describe('single configured origin', () => {
    const env = { FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com' };

    it('allows the exact configured origin', async () => {
      const response = await probe(env, 'https://control.example.com');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('https://control.example.com');
    });

    it('normalizes a trailing slash in configuration', async () => {
      const response = await probe(
        { FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com/' },
        'https://control.example.com',
      );
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('https://control.example.com');
    });

    it('denies an origin not in the list', async () => {
      const response = await probe(env, 'https://other.example.com');
      expect(response.status).toBe(403);
    });

    it('denies a subdomain of the allowed origin', async () => {
      const response = await probe(env, 'https://sub.control.example.com');
      expect(response.status).toBe(403);
    });
  });

  describe('multiple configured origins', () => {
    const env = {
      FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com, https://staging.control.example.com',
    };

    it('allows the first origin', async () => {
      const response = await probe(env, 'https://control.example.com');
      expect(response.status).toBe(200);
    });

    it('allows the second origin', async () => {
      const response = await probe(env, 'https://staging.control.example.com');
      expect(response.status).toBe(200);
    });

    it('denies an origin not in the list', async () => {
      const response = await probe(env, 'https://evil.example.com');
      expect(response.status).toBe(403);
    });
  });

  describe('missing Origin header', () => {
    it('allows server-to-server requests', async () => {
      const response = await probe({});
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('production startup validation', () => {
    it('throws if FOUNDER_ALLOWED_ORIGINS is missing', async () => {
      await expect(
        loadSecurityWithEnv({
          NODE_ENV: 'production',
          FOUNDER_ALLOWED_ORIGINS: undefined,
          FOUNDER_API_URL: 'https://api.control.example.com',
        }),
      ).rejects.toThrow('FOUNDER_ALLOWED_ORIGINS is required in production');
    });

    it('throws if FOUNDER_API_URL is missing', async () => {
      await expect(
        loadSecurityWithEnv({
          NODE_ENV: 'production',
          FOUNDER_API_URL: undefined,
          FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com',
        }),
      ).rejects.toThrow('FOUNDER_API_URL is required in production');
    });

    it('throws if FOUNDER_ALLOWED_ORIGINS contains an invalid URL', async () => {
      await expect(
        loadSecurityWithEnv({ FOUNDER_ALLOWED_ORIGINS: 'not-a-url' }),
      ).rejects.toThrow('FOUNDER_ALLOWED_ORIGINS contains an invalid URL');
    });
  });
});
