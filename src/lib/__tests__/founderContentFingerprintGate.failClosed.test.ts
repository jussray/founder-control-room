import { describe, expect, it } from 'vitest';
import {
  evaluateFounderContentFingerprintHistory,
  type FounderContentFingerprintHistory,
} from '../founderContentFingerprintGate.js';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    project: 'Founder Control Room',
    platform: 'linkedin',
    topic: 'runtime identity',
    differentiatedThesis: 'Fresh proof should explain why exact runtime identity changes launch confidence without repeating the old angle.',
    format: 'VIDEO' as const,
    formatRationale: 'The verification flow benefits from showing the runtime witness.',
    ...overrides,
  };
}

function history(overrides: Partial<FounderContentFingerprintHistory> = {}): FounderContentFingerprintHistory {
  return {
    records: [{
      id: 'recent-runtime-angle',
      platform: 'linkedin',
      project: 'fcr',
      thesis: 'A different thesis with mostly unrelated words about deployment confidence and operational evidence.',
      hook: 'A prior hook.',
      topic: 'runtime identity',
      angle: 'runtime identity',
      cta: 'A prior CTA.',
      format: 'TEXT',
      publishDate: '2026-09-01',
      status: 'published',
      performance: {
        impressions: null,
        profileViews: null,
        engagementRate: null,
        meaningfulComments: null,
        saves: null,
        shares: null,
        followerMovement: null,
        qualifiedConversations: null,
      },
    }],
    coverage: { linkedin: true, otherSocial: true, formatHistory: true },
    ...overrides,
  };
}

describe('founder-content fingerprint fail-closed coverage', () => {
  it('holds when format history coverage is incomplete even if the other history lanes are proven', () => {
    const packet = evaluateFounderContentFingerprintHistory(candidate({ topic: 'new operational topic' }), history({
      coverage: { linkedin: true, otherSocial: true, formatHistory: false },
    }));

    expect(packet.gate).toBe('HOLD');
    expect(packet.reasons).toContain('Recent format history has not been checked.');
  });

  it('holds exact normalized topic or angle reuse independently of diluted token similarity', () => {
    const packet = evaluateFounderContentFingerprintHistory(candidate(), history());

    expect(packet.closestSimilarity).toBeLessThan(0.55);
    expect(packet.gate).toBe('HOLD');
    expect(packet.closestMatchId).toBe('recent-runtime-angle');
    expect(packet.reasons).toContain('The proposed topic/angle exactly repeats a recently used angle.');
  });

  it('normalizes case and punctuation before exact recent-angle comparison', () => {
    const packet = evaluateFounderContentFingerprintHistory(
      candidate({ topic: ' Runtime—Identity! ' }),
      history(),
    );

    expect(packet.gate).toBe('HOLD');
    expect(packet.reasons).toContain('The proposed topic/angle exactly repeats a recently used angle.');
  });
});
