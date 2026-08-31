import { describe, expect, it, vi } from 'vitest';
import {
  buildFounderEditorialIdentity,
  evaluateFounderEditorialNovelty,
  founderEditorialPublicCopyHashes,
  supabaseFounderEditorialHistoryRepository,
  type FounderEditorialHistoryRepository,
} from '../founderEditorialNovelty.js';

function proposal() {
  return {
    source: { repo: 'jussray/founder-control-room', commit_sha: 'a'.repeat(40) },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'The exact public copy should not be allowed to sneak through twice.',
      public_claims: [{ text: 'Founder Control Room remembers published public copy.' }],
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
      proofStyle: 'provider-readback',
      publishDate: '2026-08-31T12:00:00.000Z',
      status: 'published',
      ...record,
    }]),
  };
}

describe('founder editorial publication memory', () => {
  it('blocks copy already present in a successful first-party publication receipt even when semantic history is empty', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const result = await evaluateFounderEditorialNovelty({
      proposal: proposal(),
      historyRepository: history({
        publicPayloadHash: identity.publicPayloadHash,
        historySource: 'execution',
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('HIGH');
    expect(result.closestMatchId).toBe('published-memory');
    expect(result.closestSimilarity).toBe(0);
    expect(result.reason).toContain('public copy already present');
  });

  it('blocks founder-attested public copy by exact or normalized SHA-256 without upgrading attestation authority', async () => {
    const copy = (proposal().public_payload as Record<string, string>).draft_text;
    const [exactCopyHash, normalizedCopyHash] = founderEditorialPublicCopyHashes(copy);

    for (const publicCopyHash of [exactCopyHash, normalizedCopyHash]) {
      const result = await evaluateFounderEditorialNovelty({
        proposal: proposal(),
        historyRepository: history({
          publicCopyHash,
          historySource: 'attestation',
          proofStyle: 'founder-attested-public-copy',
        }),
      });
      expect(result.allowed).toBe(false);
      expect(result.risk).toBe('HIGH');
    }
  });

  it('unions experiment, successful publication, and founder-attested evidence without retaining raw copy', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const exactCopyHash = identity.publicCopyHashes[0];

    function query(data: unknown[]) {
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data, error: null }));
      return chain;
    }

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
    const executions = query([{
      id: 'execution-1',
      request: {
        platform: 'linkedin',
        sourceRepo: 'jussray/founder-control-room',
        publicPayloadHash: identity.publicPayloadHash,
      },
      result: { publishedAt: '2026-08-31T12:00:00.000Z' },
      executed_at: '2026-08-31T12:00:01.000Z',
      status: 'succeeded',
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
        contentHash: exactCopyHash,
      },
      observed_at: '2026-08-30T12:05:00.000Z',
    }]);

    const client = {
      from: vi.fn((table: string) => {
        if (table === 'linkedin_experiments') return experiments;
        if (table === 'approval_executions') return executions;
        if (table === 'provider_observations') return observations;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    const rows = await repository.recentLinkedIn(32);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.historySource)).toEqual(['execution', 'attestation', 'experiment']);
    expect(rows[0]).toMatchObject({
      id: 'execution:execution-1',
      publicPayloadHash: identity.publicPayloadHash,
      status: 'published',
    });
    expect(rows[1]).toMatchObject({
      id: 'attestation:urn:li:activity:123',
      publicCopyHash: exactCopyHash,
      proofStyle: 'founder-attested-public-copy',
    });
    expect(JSON.stringify(rows)).not.toContain((proposal().public_payload as Record<string, string>).draft_text);
  });
});
