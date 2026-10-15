import { describe, it, expect } from 'vitest';
import {
  checkSecretRotationStatus,
  daysUntilExpiry,
  verifySecretsTableExists,
} from '../secret-rotation-worker.js';

describe('secret-rotation', () => {
  it('calculates days until expiry correctly', () => {
    const created = new Date();
    created.setDate(created.getDate() - 30);
    const daysLeft = daysUntilExpiry(created.toISOString(), null);
    expect(daysLeft).toBeGreaterThan(0);
    expect(daysLeft).toBeLessThanOrEqual(60);
  });

  it('identifies secrets needing rotation', async () => {
    const secret = {
      id: 'test-secret-1',
      service: 'github-app',
      secret_type: 'oauth-token',
      created_at: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000).toISOString(),
      rotated_at: null,
      expires_at: null,
      rotation_status: 'active' as const,
    };

    const mockSupabase = {
      from: () => ({
        select: () => Promise.resolve({ data: [secret], error: null }),
        insert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
      rpc: () => Promise.resolve({ data: [], error: null }),
    };

    const result = await checkSecretRotationStatus(secret, mockSupabase as any);
    expect(result?.action).toBe('rotation_started');
  });

  it('warns after the 75-day age threshold', async () => {
    const secret = {
      id: 'test-secret-warning',
      service: 'github-app',
      secret_type: 'oauth-token',
      created_at: new Date(Date.now() - 76 * 24 * 60 * 60 * 1000).toISOString(),
      rotated_at: null,
      expires_at: null,
      rotation_status: 'active' as const,
    };

    const mockSupabase = {
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    };

    const result = await checkSecretRotationStatus(secret, mockSupabase as any);
    expect(result?.action).toBe('warning_issued');
  });

  it('raises critical after the 85-day age threshold', async () => {
    const secret = {
      id: 'test-secret-critical',
      service: 'github-app',
      secret_type: 'oauth-token',
      created_at: new Date(Date.now() - 86 * 24 * 60 * 60 * 1000).toISOString(),
      rotated_at: null,
      expires_at: null,
      rotation_status: 'active' as const,
    };

    const mockSupabase = {
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    };

    const result = await checkSecretRotationStatus(secret, mockSupabase as any);
    expect(result?.action).toBe('critical_alert');
  });

  it('ignores secrets within safe window', async () => {
    const secret = {
      id: 'test-secret-safe',
      service: 'github-app',
      secret_type: 'oauth-token',
      created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      rotated_at: null,
      expires_at: null,
      rotation_status: 'active' as const,
    };

    const mockSupabase = {
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    };

    const result = await checkSecretRotationStatus(secret, mockSupabase as any);
    expect(result).toBeNull();
  });

  // IMPLANT 1 TEST: Timestamp validation
  it('throws on invalid created_at timestamp', () => {
    expect(() => daysUntilExpiry('invalid-date', null)).toThrow('Invalid timestamp');
    expect(() => daysUntilExpiry('', null)).toThrow('Invalid timestamp');
    expect(() => daysUntilExpiry('not-a-date', 'also-not-a-date')).toThrow('Invalid timestamp');
  });

  // IMPLANT 2 TEST: exercise the real schema-health helper, not the mock in isolation.
  it('fails closed when the secrets table is missing on worker init', async () => {
    const mockSupabaseNoTable = {
      from: (_table: string) => ({
        select: (_columns: string) => ({
          limit: (_count: number) => Promise.resolve({
            error: { message: 'Relation "public.secrets" does not exist' },
          }),
        }),
      }),
    };

    await expect(verifySecretsTableExists(mockSupabaseNoTable as any))
      .rejects.toThrow('CRITICAL: secrets table is missing or inaccessible');
  });
});
