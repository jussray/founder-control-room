import { describe, expect, it, vi } from 'vitest';
import {
  readSyncPartyGrowthOutcome,
  SYNC_PARTY_GROWTH_SOURCE,
} from '../syncPartyGrowthOutcome.js';

const NOW = new Date('2026-09-27T20:30:00.000Z');
const SHA = '81912973c7355e7de95e0e66f8fe736cf6418a1d';
const BUILD = 'build-sync-81912973';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stableVersion() {
  return { service: 'sync-party-game', sha: SHA, build: BUILD };
}

describe('readSyncPartyGrowthOutcome', () => {
  it('fails closed before any network call when the read key is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await readSyncPartyGrowthOutcome({
      campaignId: 'sync-launch-threads-01',
      config: {},
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      reason: 'READ_KEY_MISSING',
      requestedCampaignId: 'sync-launch-threads-01',
      authority: 'observation_only',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('binds a known product-native funnel snapshot to a stable exact runtime', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers) });
      if (url.endsWith('/api/version')) return json(stableVersion());
      return json({
        campaign_key: 'sync-launch-threads-01',
        campaign_fingerprint: 'campaign-fingerprint-123',
        seq: 21,
        unique_visitors: 6,
        counters: {
          landing_view: 8,
          play_intent: 4,
          room_created: 2,
          room_joined: 1,
          game_started: 3,
          game_finished: 2,
          rematch_started: 1,
        },
        source_counts: { threads: 8 },
        medium_counts: { 'organic-social': 8 },
        content_counts: { 'launch-post-01': 8 },
        first_at: 1000,
        last_at: 2000,
        recent_events: [
          {
            event: 'game_finished',
            event_id: 'private-ish-source-id-is-not-forwarded',
            seq: 20,
            at: 1900,
            game_seq: 5,
            event_fingerprint: 'event-fingerprint-20',
          },
        ],
      });
    });

    const result = await readSyncPartyGrowthOutcome({
      campaignId: 'SYNC Launch Threads 01',
      config: { readKey: 'provider-held-test-key' },
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'KNOWN',
      requestedCampaignId: 'sync-launch-threads-01',
      sourceCampaignKey: 'sync-launch-threads-01',
      emptyLedger: false,
      sequence: 21,
      uniqueVisitors: 6,
      runtime: stableVersion(),
      funnel: {
        landing_view: 8,
        play_intent: 4,
        room_created: 2,
        room_joined: 1,
        game_started: 3,
        game_finished: 2,
        rematch_started: 1,
      },
      semanticBoundaries: {
        signups: 'UNKNOWN',
        returningUsers: 'UNKNOWN',
        referrals: 'UNKNOWN',
        paidConversions: 'UNKNOWN',
      },
    });
    expect(result.status === 'KNOWN' ? result.recentEvents : []).toEqual([
      {
        event: 'game_finished',
        seq: 20,
        at: 1900,
        gameSeq: 5,
        eventFingerprint: 'event-fingerprint-20',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('provider-held-test-key');
    expect(JSON.stringify(result)).not.toContain('private-ish-source-id-is-not-forwarded');

    const summaryCall = calls.find(({ url }) => url.includes('/api/growth/summary'));
    expect(summaryCall?.url).toBe(`${SYNC_PARTY_GROWTH_SOURCE}/api/growth/summary?campaign=sync-launch-threads-01`);
    expect(summaryCall?.headers.get('x-growth-read-key')).toBe('provider-held-test-key');
    expect(calls.filter(({ url }) => url.endsWith('/api/version'))).toHaveLength(2);
  });

  it('keeps requested campaign identity separate from an untouched ledger default', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/version')) return json(stableVersion());
      return json({
        campaign_key: 'unattributed',
        campaign_fingerprint: null,
        seq: 0,
        unique_visitors: 0,
        counters: {},
        source_counts: {},
        medium_counts: {},
        content_counts: {},
        first_at: null,
        last_at: null,
        recent_events: [],
      });
    });

    const result = await readSyncPartyGrowthOutcome({
      campaignId: 'sync-launch-threads-01',
      config: { readKey: 'test-key' },
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'KNOWN',
      requestedCampaignId: 'sync-launch-threads-01',
      sourceCampaignKey: 'unattributed',
      emptyLedger: true,
      sequence: 0,
      uniqueVisitors: 0,
    });
  });

  it('refuses to turn a malformed source body into a clean zero', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/version')) return json(stableVersion());
      return json({});
    });

    const result = await readSyncPartyGrowthOutcome({
      campaignId: 'sync-launch-threads-01',
      config: { readKey: 'test-key' },
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      reason: 'SOURCE_INVALID',
      requestedCampaignId: 'sync-launch-threads-01',
      runtime: stableVersion(),
    });
  });

  it('does not call a rematch a returning user', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/version')) return json(stableVersion());
      return json({
        campaign_key: 'sync-launch-threads-01',
        campaign_fingerprint: 'fp',
        seq: 7,
        unique_visitors: 1,
        counters: { rematch_started: 7 },
        source_counts: {},
        medium_counts: {},
        content_counts: {},
        first_at: 1,
        last_at: 2,
        recent_events: [
          {
            event: 'rematch_started',
            event_id: 'ignored-source-event-id',
            seq: 7,
            at: 2,
            game_seq: 6,
            event_fingerprint: 'rematch-event-fingerprint',
          },
        ],
      });
    });

    const result = await readSyncPartyGrowthOutcome({
      campaignId: 'sync-launch-threads-01',
      config: { readKey: 'test-key' },
      fetchImpl,
      now: () => NOW,
    });

    expect(result.status).toBe('KNOWN');
    if (result.status !== 'KNOWN') return;
    expect(result.funnel.rematch_started).toBe(7);
    expect(result.semanticBoundaries.returningUsers).toBe('UNKNOWN');
  });

  it('classifies rejected and unconfigured source credentials without leaking the key', async () => {
    for (const [status, reason] of [[401, 'READ_KEY_REJECTED'], [503, 'SOURCE_NOT_CONFIGURED']] as const) {
      const fetchImpl = vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith('/api/version')) return json(stableVersion());
        return json({ error: 'nope' }, status);
      });

      const result = await readSyncPartyGrowthOutcome({
        campaignId: 'sync-launch-threads-01',
        config: { readKey: 'never-return-this-key' },
        fetchImpl,
        now: () => NOW,
      });

      expect(result).toMatchObject({ status: 'UNKNOWN', reason, runtime: stableVersion() });
      expect(JSON.stringify(result)).not.toContain('never-return-this-key');
    }
  });

  it('invalidates a snapshot when the runtime moves during the read', async () => {
    let versionReads = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/version')) {
        versionReads += 1;
        return json({
          service: 'sync-party-game',
          sha: versionReads === 1 ? SHA : 'a'.repeat(40),
          build: versionReads === 1 ? BUILD : 'new-build',
        });
      }
      return json({
        campaign_key: 'unattributed',
        campaign_fingerprint: null,
        seq: 0,
        unique_visitors: 0,
        counters: {},
        source_counts: {},
        medium_counts: {},
        content_counts: {},
        first_at: null,
        last_at: null,
        recent_events: [],
      });
    });

    const result = await readSyncPartyGrowthOutcome({
      campaignId: 'sync-launch-threads-01',
      config: { readKey: 'test-key' },
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      reason: 'RUNTIME_MOVED_DURING_READ',
      runtime: { sha: 'a'.repeat(40), build: 'new-build' },
    });
  });

  it('rejects an invalid campaign before any network or credential use', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await readSyncPartyGrowthOutcome({
      campaignId: '///',
      config: { readKey: 'test-key' },
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toMatchObject({ status: 'UNKNOWN', reason: 'INVALID_CAMPAIGN' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
