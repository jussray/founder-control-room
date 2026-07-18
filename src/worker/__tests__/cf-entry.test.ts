import { afterEach, describe, expect, it, vi } from 'vitest';

const { moduleLoadEnv, mockRunReconcilerCycle } = vi.hoisted(() => ({
  moduleLoadEnv: [] as Array<{ url?: string; serviceRoleKey?: string }>,
  mockRunReconcilerCycle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../reconciler.js', () => {
  moduleLoadEnv.push({
    url: process.env['SUPABASE_URL'],
    serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'],
  });

  return { runReconcilerCycle: mockRunReconcilerCycle };
});

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  moduleLoadEnv.length = 0;
  mockRunReconcilerCycle.mockClear();
  vi.resetModules();
});

describe('Cloudflare Worker scheduled handler', () => {
  it('injects Worker bindings before importing the reconciler', async () => {
    delete process.env['SUPABASE_URL'];
    delete process.env['SUPABASE_SERVICE_ROLE_KEY'];

    const { default: handler } = await import('../cf-entry.js');

    // Importing the Worker entry point must not evaluate the reconciler or the
    // environment-backed Supabase singleton.
    expect(moduleLoadEnv).toEqual([]);

    const env = {
      SUPABASE_URL: 'https://control-room.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
      SUPABASE_ANON_KEY: 'anon-test-key',
      GITHUB_WEBHOOK_SECRET: 'webhook-test-secret',
      GITHUB_APP_ID: '12345',
      GITHUB_PRIVATE_KEY: 'private-test-key',
      FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com',
      FOUNDER_API_URL: 'https://api.control.example.com',
    };
    const waitUntil = vi.fn();

    if (!handler.scheduled) throw new Error('scheduled handler is missing');
    await handler.scheduled({} as never, env, { waitUntil } as never);

    expect(moduleLoadEnv).toEqual([
      {
        url: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    ]);
    expect(mockRunReconcilerCycle).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await waitUntil.mock.calls[0]?.[0];
  });
});
