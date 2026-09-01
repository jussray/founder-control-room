import { describe, expect, it, vi } from 'vitest';
import {
  buildFounderEditorialIdentity,
  evaluateFounderEditorialNovelty,
  founderEditorialPatternFingerprint,
  supabaseFounderEditorialHistoryRepository,
  type FounderEditorialHistoryRepository,
} from '../founderEditorialNovelty.js';

function proposal() {
  return {
    source: { repo: 'jussray/founder-control-room', commit_sha: 'a'.repeat(40) },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'The exact public thesis should not vanish after publication.',
      public_claims: [{ text: 'Founder Control Room remembers published editorial patterns.' }],
    },
    internal_evidence: {
      ref: 'github:jussray/founder-control-room@a#publication-memory',
      digest: 'b'.repeat(64),
    },
  };
}

function history(record: Record<string, unknown>): FounderEditorialHistoryRepository {
  return {
    recentLinkedIn: vi.fn(async () => [{
      id: 'published-memory',
      relatedProject: 'fcr',
      coreThesis: '',
      primaryHook: '',
      angle: '',
      meaningfulChange: null,
      hookType: null,
      proofStyle: 'founder-attested-editorial-pattern',
      publishDate: '2026-08-31T12:00:00.000Z',
      status: 'published',
      ...record,
    }]),
  };
}

function query(data: unknown[]) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data, error: null }));
  return chain;
}

describe('founder editorial publication memory', () => {
  it('blocks a founder-attested thesis/hook pattern even when semantic text history is empty', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const result = await evaluateFounderEditorialNovelty({
      proposal: proposal(),
      historyRepository: history({
        promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
        historySource: 'attestation',
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('HIGH');
    expect(result.closestMatchId).toBe('published-memory');
    expect(result.closestSimilarity).toBe(0);
    expect(result.reason).toContain('already-attested thesis/hook pattern');
  });

  it('does not treat a succeeded schedule execution as publication history', async () => {
    const experiments = query([]);
    const observations = query([]);
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'linkedin_experiments') return experiments;
        if (table === 'provider_observations') return observations;
        if (table === 'approval_executions') {
          throw new Error('schedule execution must not be queried as publication memory');
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    const rows = await repository.recentLinkedIn(32);

    expect(rows).toEqual([]);
    expect(client.from).not.toHaveBeenCalledWith('approval_executions');
  });

  it('unions experiment and founder-attested pattern memory without retaining raw thesis or hook', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const attestedPattern = founderEditorialPatternFingerprint({
      thesis: identity.coreThesis,
      hook: identity.hook,
    });
    const experiments = query([{
      id: 'experiment-1',
      related_project: 'fcr',
      core_thesis: 'Different older thesis',
      primary_hook: 'Different older hook',
      angle: 'older angle',
      meaningful_change: null,
      hook_type: 'Build-in-public',
      proof_style: 'Technical proof',
      publish_date: '2026-08-29T12:00:00.000Z',
      status: 'published',
    }]);
    const observations = query([{
      resource_id: 'urn:li:activity:123',
      observed_state: {
        platform: 'linkedin',
        publication: {
          state: 'USER_ATTESTED',
          providerVerified: false,
          publishedAt: '2026-08-30T12:00:00.000Z',
        },
        editorialMemory: {
          state: 'USER_ATTESTED_PATTERN',
          promptOsPatternFingerprint: attestedPattern,
          rawTextPersisted: false,
        },
        contentHash: 'c'.repeat(64),
      },
      observed_at: '2026-08-30T12:05:00.000Z',
    }]);

    const client = {
      from: vi.fn((table: string) => {
        if (table === 'linkedin_experiments') return experiments;
        if (table === 'provider_observations') return observations;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    const rows = await repository.recentLinkedIn(32);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.historySource)).toEqual(['attestation', 'experiment']);
    expect(rows[0]).toMatchObject({
      id: 'attestation:urn:li:activity:123',
      promptOsPatternFingerprint: attestedPattern,
      proofStyle: 'founder-attested-editorial-pattern',
      status: 'published',
    });
    expect(JSON.stringify(rows)).not.toContain(identity.coreThesis);
    expect(JSON.stringify(rows)).not.toContain(identity.hook);
    expect(rows[0].publicCopyHash).toBeNull();
  });

  it('ignores founder-attested observations that lack a server-derived editorial pattern', async () => {
    const experiments = query([]);
    const observations = query([{
      resource_id: 'urn:li:activity:456',
      observed_state: {
        platform: 'linkedin',
        publication: { state: 'USER_ATTESTED', providerVerified: false },
        contentHash: 'd'.repeat(64),
      },
      observed_at: '2026-08-30T12:05:00.000Z',
    }]);
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'linkedin_experiments') return experiments;
        if (table === 'provider_observations') return observations;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    expect(await repository.recentLinkedIn(32)).toEqual([]);
  });
});
