import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  X_ENGAGEMENT_HARD_MAX_CHARGE_USD,
  XEngagementSignalService,
  type XEngagementCacheEnvelope,
  type XEngagementLease,
  type XEngagementSignalStore,
} from '../xEngagementSignal.js';

class EmptyStore implements XEngagementSignalStore {
  async get(): Promise<XEngagementCacheEnvelope | null> { return null; }
  async acquire(): Promise<XEngagementLease | null> {
    return { leaseKey: 'test', claimedAt: '2026-08-19T20:00:00.000Z' };
  }
  async reserve(): Promise<void> {}
  async complete(): Promise<void> {}
  async release(): Promise<void> {}
}

describe('X engagement portfolio boundaries', () => {
  it('rejects an oversized provider spend cap before any network call', async () => {
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;
      throw new Error('network must not be reached');
    };
    const service = new XEngagementSignalService({
      config: {
        liveEnabled: true,
        token: 'private-test-token',
        maxTotalChargeUsd: X_ENGAGEMENT_HARD_MAX_CHARGE_USD + 0.01,
      },
      store: new EmptyStore(),
      fetchImpl,
      now: () => new Date('2026-08-19T20:00:00.000Z'),
    });

    const result = await service.getTopicEngagement({ projectId: 'jbh', topic: 'lace wigs' });
    expect(result.status).toBe('UNKNOWN');
    expect(result.status === 'UNKNOWN' && result.reason).toBe('COST_CAP_INVALID');
    expect(fetchCalls).toBe(0);
  });

  it('rejects credential-like text before hashing, caching, or provider egress', async () => {
    let fetchCalls = 0;
    let storeCalls = 0;
    const store: XEngagementSignalStore = {
      async get() { storeCalls += 1; return null; },
      async acquire() { storeCalls += 1; return null; },
      async reserve() { storeCalls += 1; },
      async complete() { storeCalls += 1; },
      async release() { storeCalls += 1; },
    };
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;
      throw new Error('network must not be reached');
    };
    const service = new XEngagementSignalService({
      config: {
        liveEnabled: true,
        token: 'private-test-token',
        maxTotalChargeUsd: 0.05,
      },
      store,
      fetchImpl,
      now: () => new Date('2026-08-19T20:00:00.000Z'),
    });

    const result = await service.getTopicEngagement({
      projectId: 'chief-ai-machine',
      topic: 'api_key=supersecretvalue',
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.status === 'UNKNOWN' && result.reason).toBe('INVALID_TOPIC');
    expect(fetchCalls).toBe(0);
    expect(storeCalls).toBe(0);
  });

  it('keeps the reusable signal cache outside project-scoped provider observations', () => {
    const migration = readFileSync(
      new URL('../../../supabase/migrations/20260820003500_portfolio_signal_observations.sql', import.meta.url),
      'utf8',
    );
    const source = readFileSync(new URL('../xEngagementSignal.ts', import.meta.url), 'utf8');

    expect(migration).toContain('create table if not exists public.portfolio_signal_observations');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('control_room_service_role_only');
    expect(migration).not.toContain('project_id');
    expect(source).toContain(".from('portfolio_signal_observations')");
    expect(source).not.toContain(".from('provider_observations')");
  });
});
