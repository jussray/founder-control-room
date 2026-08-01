import { describe, expect, it } from 'vitest';
import { buildProofEngineSnapshot, type ProofSignal } from './readiness.js';

const signal = (status: ProofSignal['status'], provider: ProofSignal['provider']): ProofSignal => ({
  id: `${provider}-${status}`,
  provider,
  label: `${provider} ${status}`,
  status,
  evidence: [`${provider}:${status}`],
  checkedAt: '2026-08-01T00:00:00.000Z',
});

describe('buildProofEngineSnapshot', () => {
  it('marks all verified signals ready', () => {
    const snapshot = buildProofEngineSnapshot(
      'sekret-bip',
      [signal('verified', 'github'), signal('verified', 'supabase')],
      new Date('2026-08-01T01:00:00.000Z'),
    );

    expect(snapshot.score).toBe(100);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.blockers).toEqual([]);
  });

  it('keeps warnings conditional instead of pretending green', () => {
    const snapshot = buildProofEngineSnapshot('sekret-bip', [
      signal('verified', 'github'),
      signal('warning', 'supabase'),
      signal('unknown', 'cloudflare'),
    ]);

    expect(snapshot.score).toBe(58);
    expect(snapshot.status).toBe('conditional');
  });

  it('makes any blocked provider block launch readiness', () => {
    const snapshot = buildProofEngineSnapshot('sekret-bip', [
      signal('verified', 'github'),
      signal('blocked', 'playwright'),
    ]);

    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toEqual(['playwright: playwright blocked']);
  });
});
