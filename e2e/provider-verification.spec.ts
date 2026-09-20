/**
 * Provider boundary E2E suite.
 *
 * Public evidence proves only the health surface. Provider configuration is
 * founder-private metadata and must never be exposed anonymously. A credentialed
 * CI lane may additionally prove the configured provider, but a missing founder
 * bearer must be reported as missing privileged proof rather than replaced with
 * anonymous debug access.
 */
import { test, expect } from '@playwright/test';

const founderBearer = process.env.FCR_E2E_FOUNDER_BEARER?.trim() ?? '';

test.describe('Control Room – server baseline', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

test.describe('Control Room – provider metadata boundary', () => {
  test('GET /_debug/provider is not public', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    expect(res.status()).toBe(401);
    const raw = await res.text();
    expect(raw).not.toContain('openaiKeyPresent');
    expect(raw).not.toContain('perplexityKeyPresent');
    expect(raw).not.toContain('nodeEnv');
  });

  test('credentialed founder inspection proves a real provider without exposing key values', async ({ request }) => {
    test.skip(!founderBearer, 'Privileged provider proof requires FCR_E2E_FOUNDER_BEARER; anonymous debug access is intentionally forbidden.');

    const res = await request.get('/_debug/provider', {
      headers: { Authorization: `Bearer ${founderBearer}` },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('private');
    expect(res.headers()['cache-control']).toContain('no-store');

    const raw = await res.text();
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(['openai', 'perplexity']).toContain(body.provider);
    expect(body.mock).toBe(false);
    expect(body.fallback).toBe(false);
    expect(body.openaiKeyPresent === true || body.perplexityKeyPresent === true).toBe(true);

    expect(raw).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(raw).not.toMatch(/pplx-[A-Za-z0-9_-]{20,}/);
    expect(raw).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{12,}/);
  });
});
