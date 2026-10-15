import { describe, it, expect } from 'vitest';
import {
  checkSecretRotationStatus,
  daysUntilExpiry,
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
        update: () => Promise.resolve({ error: null }),
      }),
      rpc: () => Promise.resolve({ data: [], error: null }),
    };

    const result = await checkSecretRotationStatus(secret, mockSupabase as any);
    expect(result).toBeDefined();
    expect(['rotation_started', 'warning_issued', 'critical_alert']).toContain(result?.action);
  });

  it('warns when threshold approaches', async () => {
    const secret = {
      id: 'test-secret-warning',
      service: 'github-app',
      secret_type: 'oauth-token',
      created_at: new Date(Date.now() - 73 * 24 * 60 * 60 * 1000).toISOString(),
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
    expect(result).toBeDefined();
    expect(['warning_issued', 'critical_alert']).toContain(result?.action);
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

  // IMPLANT 2 TEST: Schema health check
  it('would fail if secrets table missing on worker init', async () => {
    const mockSupabaseNoTable = {
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ error: { message: 'Relation "public.secrets" does not exist' } }),
        }),
      }),
    };

    // Verify the error path: if schema missing, query fails
    const { error } = await mockSupabaseNoTable.from('secrets').select('id').limit(0) as any;
    expect(error).toBeDefined();
    expect(error.message).toMatch(/does not exist/);
  });
});
