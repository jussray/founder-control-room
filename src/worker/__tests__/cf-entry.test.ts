import type { ExportedHandler } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import {
  composeWorkerHandler,
  validateWorkerEnv,
  type ControlRoomWorkerEnv,
} from '../handler.js';

interface TestEnv {
  label: string;
}

const VALID_ENV: ControlRoomWorkerEnv = {
  SUPABASE_URL: 'https://control-room.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
  GITHUB_WEBHOOK_SECRET: 'webhook-test-secret',
  GITHUB_TOKEN: 'github-token-test-value',
  FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com,https://staging.control.example.com',
  FOUNDER_API_URL: 'https://api.control.example.com',
};

describe('Cloudflare Worker binding validation', () => {
  it('accepts complete absolute production bindings', () => {
    expect(() => validateWorkerEnv(VALID_ENV)).not.toThrow();
  });

  it('reports every missing required binding in one failure', () => {
    expect(() => validateWorkerEnv({ SUPABASE_URL: 'https://control-room.supabase.co' }))
      .toThrow('Missing required Worker bindings: SUPABASE_SERVICE_ROLE_KEY');
  });

  it('rejects malformed service and callback URLs', () => {
    expect(() => validateWorkerEnv({ ...VALID_ENV, FOUNDER_API_URL: 'not-a-url' }))
      .toThrow('SUPABASE_URL and FOUNDER_API_URL must be absolute URLs');
  });

  it('rejects origins containing paths or invalid URLs', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com/app,invalid-origin',
    })).toThrow('FOUNDER_ALLOWED_ORIGINS must contain comma-separated absolute origins');
  });
});

describe('Cloudflare Worker handler composition', () => {
  it('delegates fetch requests to Cloudflare\'s HTTP adapter', async () => {
    const response = new Response('ok', { status: 202 });
    const mockFetch = vi.fn().mockResolvedValue(response);
    const httpHandler: ExportedHandler<TestEnv> = { fetch: mockFetch };
    const loadReconciler = vi.fn();
    const handler = composeWorkerHandler(httpHandler, loadReconciler);
    const request = new Request('https://control.example.com/health');
    const env = { label: 'test' };
    const ctx = {} as never;

    if (!handler.fetch) throw new Error('fetch handler is missing');
    const result = await handler.fetch(request as never, env, ctx);

    expect(result).toBe(response);
    expect(mockFetch).toHaveBeenCalledWith(request, env, ctx);
    expect(loadReconciler).not.toHaveBeenCalled();
  });

  it('loads the reconciler only for scheduled events and registers its promise', async () => {
    const mockRunReconcilerCycle = vi.fn().mockResolvedValue(undefined);
    const loadReconciler = vi.fn().mockResolvedValue({
      runReconcilerCycle: mockRunReconcilerCycle,
    });
    const httpHandler: ExportedHandler<TestEnv> = {
      fetch: vi.fn().mockResolvedValue(new Response('ok')),
    };
    const handler = composeWorkerHandler(httpHandler, loadReconciler);
    const waitUntil = vi.fn();

    if (!handler.scheduled) throw new Error('scheduled handler is missing');
    await handler.scheduled(
      {} as never,
      { label: 'test' },
      { waitUntil } as never,
    );

    expect(loadReconciler).toHaveBeenCalledTimes(1);
    expect(mockRunReconcilerCycle).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]?.[0];
  });

  it('fails during composition when the HTTP adapter has no fetch handler', () => {
    expect(() => composeWorkerHandler({}, vi.fn())).toThrow(
      'Cloudflare HTTP handler is missing fetch',
    );
  });
});
