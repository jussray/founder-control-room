/**
 * Provider verification E2E suite.
 *
 * Verifies:
 * 1. Server is live and /health returns { ok: true }
 * 2. /_debug/provider returns a real provider (not mock, not fallback)
 * 3. The provider name is one of the governed real provider lanes
 * 4. Required env keys are present in the runtime (key existence only — never values)
 *
 * This is the Control Room end-to-end evidence artifact.
 * Do not expand to other repos until this suite passes with real artifacts.
 */
import { test, expect } from '@playwright/test';

test.describe('Control Room – server baseline', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

test.describe('Control Room – provider verification', () => {
  test('GET /_debug/provider returns real provider name', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Must declare a known real provider.
    expect(['openai', 'perplexity', 'deepseek']).toContain(body.provider);

    // Must not be flagged as mock or fallback.
    expect(body.mock).toBe(false);
    expect(body.fallback).toBe(false);
  });

  test('/_debug/provider shows required key presence', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    const body = await res.json();

    // At least one governed AI provider key must be set in the CI/runtime environment.
    const hasKey = body.openaiKeyPresent === true ||
      body.perplexityKeyPresent === true ||
      body.deepseekKeyPresent === true;
    expect(hasKey).toBe(true);
  });

  test('/_debug/provider never exposes key values', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    const raw = await res.text();

    // Ensure the response body contains no secret-shaped provider key strings.
    expect(raw).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(raw).not.toMatch(/pplx-[A-Za-z0-9_-]{20,}/);
  });
});
