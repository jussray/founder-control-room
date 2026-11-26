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
    ], new Date('2026-08-01T01:00:00.000Z'));

    expect(snapshot.score).toBe(58);
    expect(snapshot.status).toBe('conditional');
  });

  it('makes any blocked provider block launch readiness', () => {
    const snapshot = buildProofEngineSnapshot('sekret-bip', [
      signal('verified', 'github'),
      signal('blocked', 'playwright'),
    ], new Date('2026-08-01T01:00:00.000Z'));

    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toEqual(['playwright: playwright blocked']);
  });
});

describe('readiness evidence freshness (fail closed)', () => {
  const checkedAt = '2026-11-21T09:50:00.000Z';
  const now = new Date('2026-11-21T10:00:00.000Z');
  const verified: ProofSignal = {
    id: 'github-head',
    provider: 'github',
    label: 'Exact-head proof',
    status: 'verified',
    evidence: ['github:run:123'],
    checkedAt,
  };

  it('accepts a fresh source-observed proof signal within the lease', () => {
    const snapshot = buildProofEngineSnapshot('fcr', [verified], now);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.score).toBe(100);
  });

  it('blocks a stale verified signal rather than calling the release ready', () => {
    const snapshot = buildProofEngineSnapshot('fcr', [
      { ...verified, checkedAt: '2026-11-20T00:00:00.000Z' },
    ], now);
    expect(snapshot.status).toBe('blocked');
    expect(snapshot.score).toBe(0);
    expect(snapshot.blockers).toContain('github: Exact-head proof (stale verification)');
  });

  it('blocks verified claims without evidence, including whitespace-only refs', () => {
    const snapshot = buildProofEngineSnapshot('fcr', [
      { ...verified, evidence: ['', '   '] },
    ], now);
    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toContain('github: Exact-head proof (missing evidence)');
  });

  it('blocks missing, invalid, and future timestamps', () => {
    for (const timestamp of [null, 'not-a-date', '2026-11-21T11:00:00.000Z']) {
      const snapshot = buildProofEngineSnapshot('fcr', [{ ...verified, checkedAt: timestamp }], now);
      expect(snapshot.status).toBe('blocked');
    }
  });

  it('blocks readiness with no proof signals', () => {
    const snapshot = buildProofEngineSnapshot('fcr', [], now);
    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toContain('proof-engine: no proof signals observed');
  });

  it('preserves an explicit blocked signal after its check time ages', () => {
    const snapshot = buildProofEngineSnapshot('fcr', [
      { ...verified, status: 'blocked', checkedAt: '2026-01-01T00:00:00.000Z' },
    ], now);
    expect(snapshot.status).toBe('blocked');
    expect(snapshot.blockers).toContain('github: Exact-head proof');
  });

  it('accepts an exact one-hour-old verified signal but rejects an older one', () => {
    const atBoundary = buildProofEngineSnapshot('fcr', [
      { ...verified, checkedAt: '2026-11-21T09:00:00.000Z' },
    ], now);
    const pastBoundary = buildProofEngineSnapshot('fcr', [
      { ...verified, checkedAt: '2026-11-21T08:59:59.999Z' },
    ], now);
    expect(atBoundary.status).toBe('ready');
    expect(pastBoundary.status).toBe('blocked');
  });
});
