/**
 * Provider/debug boundary E2E suite.
 *
 * Public browser proof is intentionally limited to the health surface. Provider
 * selection, key-presence booleans, fallback state, and NODE_ENV are founder
 * inspection metadata and must not be readable anonymously.
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

test.describe('Control Room – provider debug boundary', () => {
  test('GET /_debug/provider requires founder authentication', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    expect(res.status()).toBe(401);
    const body = await res.json();

    expect(body).toEqual({ error: 'Founder session required' });
    expect(body).not.toHaveProperty('provider');
    expect(body).not.toHaveProperty('mock');
    expect(body).not.toHaveProperty('fallback');
    expect(body).not.toHaveProperty('openaiKeyPresent');
    expect(body).not.toHaveProperty('perplexityKeyPresent');
    expect(body).not.toHaveProperty('nodeEnv');
  });

  test('/_debug/provider anonymous response cannot expose key-shaped values', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    const raw = await res.text();

    expect(raw).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(raw).not.toMatch(/pplx-[A-Za-z0-9]{20,}/);
  });
});
