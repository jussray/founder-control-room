import { describe, expect, it, vi } from 'vitest';
import {
  evaluateFounderContentFingerprintGate,
  evaluateFounderContentFingerprintHistory,
  supabaseFounderContentFingerprintHistoryRepository,
  type FounderContentFingerprintHistory,
  type FounderContentFingerprintHistoryRepository,
} from '../founderContentFingerprintGate.js';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    project: 'Founder Control Room',
    platform: 'linkedin',
    topic: 'runtime identity',
    differentiatedThesis: 'A deployment is not finished until the runtime can prove it is serving the exact source revision we intended to ship.',
    format: 'VIDEO' as const,
    formatRationale: 'The runtime witness and product behavior are stronger when viewers can see the verification flow happen.',
    ...overrides,
  };
}

function baseHistory(overrides: Partial<FounderContentFingerprintHistory> = {}): FounderContentFingerprintHistory {
  return {
    records: [{
      id: 'post-1',
      platform: 'linkedin',
      project: 'Chief',
      thesis: 'Agents need bounded authority before they act.',
      hook: 'The dangerous part is not whether the agent can click the button.',
      topic: 'agent authority',
      angle: 'bounded agent authority',
      cta: 'What do you verify before giving an agent permission?',
      format: 'TEXT',
      publishDate: '2026-08-30',
      status: 'analyzed',
      performance: {
        impressions: 1200,
        profileViews: 18,
        engagementRate: 4.2,
        meaningfulComments: 5,
        saves: 11,
        shares: 3,
        followerMovement: 4,
        qualifiedConversations: 2,
      },
    }],
    coverage: {
      linkedin: true,
      otherSocial: true,
      formatHistory: true,
    },
    ...overrides,
  };
}

describe('founder-content pre-draft fingerprint gate', () => {
  it('passes only after history coverage, angle elimination, deliberate format, and differentiated thesis are present', () => {
    const packet = evaluateFounderContentFingerprintHistory(candidate(), baseHistory());

    expect(packet.gate).toBe('PASS');
    expect(packet.recent.hooks).toEqual(['The dangerous part is not whether the agent can click the button.']);
    expect(packet.recent.topics).toEqual(['agent authority']);
    expect(packet.recent.ctas).toEqual(['What do you verify before giving an agent permission?']);
    expect(packet.recent.formats).toEqual(['TEXT']);
    expect(packet.recent.performanceSignals[0]).toMatchObject({
      impressions: 1200,
      saves: 11,
      qualifiedConversations: 2,
    });
    expect(packet.ruledOutAngles).toEqual([
      expect.objectContaining({ angle: 'bounded agent authority', reason: 'RECENTLY_USED' }),
    ]);
    expect(packet.authority).toEqual({ draft: false, approve: false, schedule: false, publish: false });
  });

  it('holds when non-LinkedIn social history has not been checked', () => {
    const packet = evaluateFounderContentFingerprintHistory(candidate(), baseHistory({
      coverage: { linkedin: true, otherSocial: false, formatHistory: true },
    }));

    expect(packet.gate).toBe('HOLD');
    expect(packet.reasons).toContain('Recent non-LinkedIn social history has not been checked.');
  });

  it('holds when the next format is not deliberate or the differentiated thesis is missing', () => {
    const packet = evaluateFounderContentFingerprintHistory(candidate({
      differentiatedThesis: '',
      format: null,
      formatRationale: '',
    }), baseHistory());

    expect(packet.gate).toBe('HOLD');
    expect(packet.reasons).toContain('One differentiated thesis is required before drafting.');
    expect(packet.reasons).toContain('A deliberate VIDEO, IMAGE, or TEXT format choice is required before drafting.');
  });

  it('holds a thesis that substantially overlaps a recently used angle', () => {
    const history = baseHistory({
      records: [{
        ...baseHistory().records[0],
        id: 'runtime-post',
        thesis: 'A deployment is not finished until runtime proves it serves the exact source revision.',
        topic: 'runtime identity',
        angle: 'exact source runtime identity',
      }],
    });

    const packet = evaluateFounderContentFingerprintHistory(candidate(), history);

    expect(packet.gate).toBe('HOLD');
    expect(packet.closestMatchId).toBe('runtime-post');
    expect(packet.closestSimilarity).toBeGreaterThanOrEqual(0.55);
    expect(packet.ruledOutAngles[0].reason).toBe('HIGH_THESIS_OVERLAP');
  });

  it('defaults fail-closed because the current Supabase adapter proves LinkedIn history but not cross-social history', async () => {
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(async () => ({
      data: [{
        id: 'linkedin-1',
        related_project: 'fcr',
        core_thesis: 'Older thesis',
        primary_hook: 'Older hook',
        angle: 'older angle',
        cta: 'Reply with your take',
        publish_date: '2026-08-30',
        status: 'published',
        impressions: 500,
      }],
      error: null,
    }));

    const client = { from: vi.fn(() => query) };
    const repository = supabaseFounderContentFingerprintHistoryRepository(client as any);
    const packet = await evaluateFounderContentFingerprintGate({ candidate: candidate(), historyRepository: repository });

    expect(client.from).toHaveBeenCalledWith('linkedin_experiments');
    expect(packet.coverage).toEqual({ linkedin: true, otherSocial: false, formatHistory: false });
    expect(packet.gate).toBe('HOLD');
    expect(packet.reasons).toContain('Recent non-LinkedIn social history has not been checked.');
  });

  it('supports a caller that supplies reconciled LinkedIn plus cross-social history', async () => {
    const repository: FounderContentFingerprintHistoryRepository = {
      recent: vi.fn(async () => baseHistory()),
    };

    const packet = await evaluateFounderContentFingerprintGate({ candidate: candidate(), historyRepository: repository });

    expect(repository.recent).toHaveBeenCalledWith(32);
    expect(packet.gate).toBe('PASS');
  });
});
