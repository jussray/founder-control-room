import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_ROOM_SUPABASE_PROJECT_REF } from '../supabaseProjectIdentity.js';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ kind: 'supabase-client' })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

const ENV_KEYS = [
  'NODE_ENV',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ALLOW_LOCAL',
] as const;

const savedEnvironment = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnvironment.set(key, process.env[key]);
  createClientMock.mockClear();
  vi.resetModules();
});

afterEach(() => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment.clear();
  vi.resetModules();
});

function setEnvironment(values: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('makeSupabaseClient project identity enforcement', () => {
  it('rejects an unexpected project before creating a privileged client', async () => {
    setEnvironment({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_ALLOW_LOCAL: undefined,
    });

    await expect(import('../supabaseClient.js')).rejects.toThrow(
      'does not match the Founder Control Room project ref',
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('creates the privileged client after the exact project identity passes', async () => {
    const url = `https://${CONTROL_ROOM_SUPABASE_PROJECT_REF}.supabase.co`;
    setEnvironment({
      NODE_ENV: 'production',
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_ALLOW_LOCAL: undefined,
    });

    const module = await import('../supabaseClient.js');

    expect(module.supabase).toEqual({ kind: 'supabase-client' });
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(url, 'test-service-role-key', {
      auth: { persistSession: false },
    });
  });

  it('allows an explicitly opted-in local client only in test', async () => {
    setEnvironment({
      NODE_ENV: 'test',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_ALLOW_LOCAL: 'true',
    });

    await import('../supabaseClient.js');

    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('rejects the local opt-in when production is active', async () => {
    setEnvironment({
      NODE_ENV: 'production',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_ALLOW_LOCAL: 'true',
    });

    await expect(import('../supabaseClient.js')).rejects.toThrow(
      'requires SUPABASE_ALLOW_LOCAL=true with NODE_ENV=development or test',
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
