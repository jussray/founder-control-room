/**
 * Anonymous provider-debug boundary proof on the running FCR server.
 * Authenticated provider selection is verified separately behind the founder gate.
 */
import { test, expect } from '@playwright/test';

test.describe('Control Room – provider debug boundary', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('GET /_debug/provider rejects anonymous callers without metadata', async ({ request }) => {
    const res = await request.get('/_debug/provider');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Founder session required' });
    for (const field of ['provider', 'mock', 'fallback', 'openaiKeyPresent', 'perplexityKeyPresent', 'deepseekKeyPresent', 'nodeEnv']) {
      expect(body).not.toHaveProperty(field);
    }
  });
});
