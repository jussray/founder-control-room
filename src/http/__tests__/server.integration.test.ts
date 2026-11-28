import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock('../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import request from 'supertest';
import { createServer } from '../server.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createServer', () => {
  it('responds to /health without auth and identifies the deployed service', async () => {
    const res = await request(createServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-founder-control-room-service']).toBe('founder-control-room');
  });

  it('preserves public and denied responses under a bounded concurrent synthetic workload', async () => {
    const limits = { requests: 96, concurrency: 8, p95Ms: 1000, wallMs: 15000 };
    const server = createServer().listen(0, '127.0.0.1');
    const externalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('SCALABILITY_EXTERNAL_FETCH_BLOCKED'));
    const samples: number[] = [];
    const failures = new Set<string>();
    const counts = { health: 0, deniedOrigin: 0, unauthorizedMcp: 0 };
    let outboundAttempts = 0;
    let recovered = false;
    let wallMs = 0;
    const rssBeforeBytes = process.memoryUsage().rss;
    try {
      await once(server, 'listening');
      const client = request(server);
      const start = performance.now();
      for (let offset = 0; offset < limits.requests; offset += limits.concurrency) {
        if (performance.now() - start > limits.wallMs) break;
        await Promise.all(Array.from({ length: limits.concurrency }, async (_, index) => {
          const id = offset + index;
          const began = performance.now();
          try {
            if (id % 3 === 0) {
              const res = await client.get('/health').timeout({ response: 2000, deadline: 4000 });
              if (res.status !== 200 || res.body.ok !== true ||
                  res.headers['x-founder-control-room-service'] !== 'founder-control-room' ||
                  res.headers['x-content-type-options'] !== 'nosniff') failures.add('HEALTH_RESPONSE');
              counts.health++;
            } else if (id % 3 === 1) {
              const res = await client.get('/health').set('Origin', 'https://evil.example.com')
                .timeout({ response: 2000, deadline: 4000 });
              if (res.status !== 403) failures.add('CORS_ISOLATION');
              counts.deniedOrigin++;
            } else {
              const res = await client.post('/mcp')
                .send({ jsonrpc: '2.0', id, method: 'tools/list' })
                .timeout({ response: 2000, deadline: 4000 });
              if (res.status !== 401 || !res.headers['www-authenticate'] ||
                  res.body.error?.message !== 'Unauthorized') failures.add('MCP_AUTH_ISOLATION');
              counts.unauthorizedMcp++;
            }
          } catch {
            failures.add('REQUEST_FAILED');
          } finally {
            samples.push(performance.now() - began);
          }
        }));
      }
      wallMs = performance.now() - start;
      const res = await client.get('/health').timeout({ response: 2000, deadline: 4000 });
      recovered = res.status === 200 && res.body.ok === true;
    } finally {
      outboundAttempts = externalFetch.mock.calls.length;
      externalFetch.mockRestore();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    samples.sort((a, b) => a - b);
    const p95Ms = samples.length ? samples[Math.ceil(samples.length * 0.95) - 1] : null;
    if (samples.length !== limits.requests ||
        Object.values(counts).some(count => count !== limits.requests / 3)) failures.add('INCOMPLETE_SAMPLE');
    if (p95Ms === null || p95Ms > limits.p95Ms) failures.add('P95_BUDGET');
    if (wallMs > limits.wallMs) failures.add('WALL_BUDGET');
    if (!recovered) failures.add('RECOVERY');
    if (outboundAttempts) failures.add('EXTERNAL_FETCH');
    if (process.env.FCR_SCALABILITY_RECEIPT === '1') {
      writeFileSync('fcr-scalability-smoke-receipt.json', JSON.stringify({
        contract: 'synthetic-scalability-smoke/v1',
        scope: 'single loopback Express server, synthetic requests, mocked auth/database',
        expectedHeadSha: process.env.EXPECTED_HEAD_SHA ?? null,
        limits, counts, completed: samples.length, p95Ms, wallMs,
        requestsPerSecond: wallMs > 0 ? samples.length * 1000 / wallMs : null,
        rssBeforeBytes, rssAfterBytes: process.memoryUsage().rss,
        recovered, outboundAttempts, failures: [...failures], passed: failures.size === 0,
        limitations: ['Provisional CI thresholds', 'Not peak memory, live database, edge, provider or multi-instance proof'],
      }, null, 2) + '\n');
    }
    expect([...failures]).toEqual([]);
  }, 25000);

  it('exposes exact deployed V10 and Supabase runtime identity without secrets', async () => {
    const sha = 'a'.repeat(40);
    vi.stubEnv('GIT_SHA', sha);
    vi.stubEnv('SUPABASE_PROJECT_REF', 'abcdefghijklmnopqrst');
    vi.stubEnv('FCR_V10_MAX_RUNTIME_AUTHORITY', 'draft');
    vi.stubEnv('FCR_V10_REGISTRY_RESOLUTION_REQUIRED', 'true');
    vi.stubEnv('FCR_V10_RECEIPT_PERSISTENCE_REQUIRED', 'true');

    const res = await request(createServer()).get('/version');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      service: 'founder-control-room',
      gitSha: sha,
      v10: {
        capabilityPlanContract: 'juss-v10/capability-plan@v1',
        conveyorContract: 'founder-control-room/n8n-conveyor@v3',
        supabaseProjectRef: 'abcdefghijklmnopqrst',
        maxRuntimeAuthority: 'draft',
        trustedRegistryRequiredBeforeL1: true,
        receiptPersistenceRequired: true,
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/service-role|private-key|bearer|token/i);
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

  it('does not publish the capability registry as a static asset', async () => {
    const res = await request(createServer({ serveStatic: true }))
      .get('/control-room/capability-registry.js');
    expect(res.status).toBe(404);
  });

  it('rejects a cross-origin request from a non-allowlisted origin', async () => {
    const res = await request(createServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });

  it('lets an unauthenticated paired MCP client reach the OAuth bearer challenge before browser CSRF', async () => {
    const res = await request(createServer())
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain(
      'resource_metadata="https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp"',
    );
    expect(res.body.error?.message).toBe('Unauthorized');
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
