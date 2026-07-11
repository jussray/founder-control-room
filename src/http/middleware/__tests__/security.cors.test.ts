/**
 * CORS middleware unit tests.
 *
 * Tests the origin resolution and normalization logic in isolation,
 * without spinning up a full Express server.
 *
 * Run: npx vitest run src/http/middleware/__tests__/security.cors.test.ts
 *
 * Prerequisites: add vitest to devDependencies
 *   npm install -D vitest
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Re-imports security.ts with controlled env vars by manipulating
 * process.env before each test block. Uses dynamic import + cache-bust
 * because the module resolves ALLOWED_ORIGINS at load time.
 */
async function loadSecurityWithEnv(
  env: Record<string, string | undefined>,
): Promise<{ allowOrigin: (origin: string | undefined) => Promise<boolean> }> {
  const saved: Record<string, string | undefined> = {};

  // Apply test env
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  // Reset NODE_ENV so startup validation doesn't throw
  const savedNodeEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'test';

  // Dynamic import with cache-bust query so each call gets a fresh module
  const mod = await import(`../security.js?t=${Date.now()}`);

  // Restore env
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  process.env['NODE_ENV'] = savedNodeEnv;

  // Wrap cors middleware into a testable promise
  const allowOrigin = (origin: string | undefined): Promise<boolean> =>
    new Promise((resolve, reject) => {
      // Access the internal cors option by calling with a fake req
      // We test the origin resolver logic directly
      const corsOptions = (mod.corsMiddleware as unknown as { _options: { origin: Function } })._options;
      if (corsOptions?.origin) {
        corsOptions.origin(origin, (err: Error | null, allowed: boolean) => {
          if (err) reject(err);
          else resolve(allowed);
        });
      } else {
        // Fallback: middleware is configured with a static list
        resolve(false);
      }
    });

  return { allowOrigin };
}

// ---------------------------------------------------------------------------
// parseOrigins behaviour (tested indirectly via the module)
// ---------------------------------------------------------------------------

describe('CORS origin resolution', () => {
  describe('development defaults (no env vars set)', () => {
    it('allows http://localhost:3000', async () => {
      delete process.env['FOUNDER_ALLOWED_ORIGINS'];
      delete process.env['NODE_ENV'];
      const { allowOrigin } = await loadSecurityWithEnv({});
      await expect(allowOrigin('http://localhost:3000')).resolves.toBe(true);
    });

    it('allows http://localhost:8787', async () => {
      const { allowOrigin } = await loadSecurityWithEnv({});
      await expect(allowOrigin('http://localhost:8787')).resolves.toBe(true);
    });

    it('denies a random external origin', async () => {
      const { allowOrigin } = await loadSecurityWithEnv({});
      await expect(allowOrigin('https://evil.example.com')).rejects.toThrow('CORS: origin not allowed');
    });
  });

  describe('single configured origin', () => {
    const env = { FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com' };

    it('allows the exact configured origin', async () => {
      const { allowOrigin } = await loadSecurityWithEnv(env);
      await expect(allowOrigin('https://control.example.com')).resolves.toBe(true);
    });

    it('allows origin with trailing slash (normalized to same origin)', async () => {
      // Browser never sends trailing slash in Origin header, but the env var
      // might have one. URL().origin strips it, so both resolve to the same string.
      const { allowOrigin } = await loadSecurityWithEnv({
        FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com/',
      });
      await expect(allowOrigin('https://control.example.com')).resolves.toBe(true);
    });

    it('denies an origin not in the list', async () => {
      const { allowOrigin } = await loadSecurityWithEnv(env);
      await expect(allowOrigin('https://other.example.com')).rejects.toThrow('CORS: origin not allowed');
    });

    it('denies a subdomain of the allowed origin', async () => {
      const { allowOrigin } = await loadSecurityWithEnv(env);
      await expect(allowOrigin('https://sub.control.example.com')).rejects.toThrow('CORS: origin not allowed');
    });
  });

  describe('multiple configured origins', () => {
    const env = {
      FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com, https://staging.control.example.com',
    };

    it('allows the first origin', async () => {
      const { allowOrigin } = await loadSecurityWithEnv(env);
      await expect(allowOrigin('https://control.example.com')).resolves.toBe(true);
    });

    it('allows the second origin', async () => {
      const { allowOrigin } = await loadSecurityWithEnv(env);
      await expect(allowOrigin('https://staging.control.example.com')).resolves.toBe(true);
    });

    it('denies an origin not in the list', async () => {
      const { allowOrigin } = await loadSecurityWithEnv(env);
      await expect(allowOrigin('https://evil.example.com')).rejects.toThrow('CORS: origin not allowed');
    });
  });

  describe('missing Origin header (server-to-server)', () => {
    it('allows requests with no Origin', async () => {
      const { allowOrigin } = await loadSecurityWithEnv({});
      // undefined origin = no Origin header = server-to-server
      await expect(allowOrigin(undefined)).resolves.toBe(true);
    });
  });

  describe('production startup validation', () => {
    it('throws if FOUNDER_ALLOWED_ORIGINS is missing in production', async () => {
      await expect(
        loadSecurityWithEnv({
          NODE_ENV: 'production',
          FOUNDER_ALLOWED_ORIGINS: undefined,
          FOUNDER_API_URL: 'https://api.control.example.com',
        }),
      ).rejects.toThrow('FOUNDER_ALLOWED_ORIGINS is required in production');
    });

    it('throws if FOUNDER_API_URL is missing in production', async () => {
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
        loadSecurityWithEnv({
          FOUNDER_ALLOWED_ORIGINS: 'not-a-url',
        }),
      ).rejects.toThrow('FOUNDER_ALLOWED_ORIGINS contains an invalid URL');
    });
  });
});
