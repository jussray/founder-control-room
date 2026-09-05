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
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data, error: null }));
  return chain;
}

function historyClient(input: {
  experiments?: unknown[];
  observations?: unknown[];
  executions?: unknown[];
  patterns?: unknown[];
}) {
  const experiments = query(input.experiments ?? []);
  const observations = query(input.observations ?? []);
  const executions = query(input.executions ?? []);
  const patterns = query(input.patterns ?? []);
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'linkedin_experiments') return experiments;
      if (table === 'provider_observations') return observations;
      if (table === 'approval_executions') return executions;
      if (table === 'founder_content_active_editorial_pattern_reservations') return patterns;
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { client, experiments, observations, executions, patterns };
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
    expect(result.reason).toContain('already-published thesis/hook pattern');
  });

  it('turns a provider-readback-verified direct publication into fingerprint-only novelty memory', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const { client } = historyClient({
      executions: [{
        id: 'execution-1',
        action_type: 'publish_founder_content',
        status: 'succeeded',
        success: true,
        request: {
          approvalId: 'fca:verified-direct',
          publicPayloadHash: 'c'.repeat(64),
        },
        result: {
          contract: 'fcr/first-party-founder-content-publish@v1',
          truthState: 'PUBLISHED',
          published: true,
          platform: 'linkedin',
          externalPostId: 'urn:li:share:123',
          permalink: 'https://www.linkedin.com/feed/update/urn:li:share:123/',
          publishedAt: '2026-08-31T12:00:00.000Z',
        },
        executed_at: '2026-08-31T12:00:01.000Z',
      }],
      patterns: [{
        approval_id: 'fca:verified-direct',
        pattern_fingerprint: identity.promptOsPatternFingerprint,
        reserved_at: '2026-08-31T11:55:00.000Z',
        expires_at: '2026-08-31T12:25:00.000Z',
      }],
    });

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    const rows = await repository.recentLinkedIn(32);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'provider-readback:urn:li:share:123',
      historySource: 'provider_readback',
      proofStyle: 'provider-verified-editorial-pattern',
      promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
      publicPayloadHash: 'c'.repeat(64),
      status: 'published',
    });
    expect(rows[0].coreThesis).toBe('');
    expect(rows[0].primaryHook).toBe('');
    expect(rows[0].publicCopyHash).toBeNull();

    const result = await evaluateFounderEditorialNovelty({
      proposal: proposal(),
      historyRepository: { recentLinkedIn: vi.fn(async () => rows) },
    });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('HIGH');
    expect(result.closestMatchId).toBe('provider-readback:urn:li:share:123');
  });

  it('does not treat a succeeded schedule execution as publication history', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const { client } = historyClient({
      executions: [{
        id: 'schedule-1',
        action_type: 'schedule_founder_content',
        status: 'succeeded',
        success: true,
        request: { approvalId: 'fca:schedule-only' },
        result: {
          contract: 'fcr/n8n-founder-content-orchestration@v1',
          truthState: 'provider_schedule_receipt_pending_readback',
          published: false,
          platform: 'linkedin',
        },
      }],
      patterns: [{
        approval_id: 'fca:schedule-only',
        pattern_fingerprint: identity.promptOsPatternFingerprint,
      }],
    });

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    expect(await repository.recentLinkedIn(32)).toEqual([]);
  });

  it('does not retain failed, unknown, or unmapped direct publication attempts as memory', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const { client } = historyClient({
      executions: [
        {
          id: 'unknown-1',
          action_type: 'publish_founder_content',
          status: 'failed',
          success: false,
          request: { approvalId: 'fca:unknown' },
          result: {
            contract: 'fcr/first-party-founder-content-publish@v1',
            truthState: 'UNKNOWN',
            published: false,
            platform: 'linkedin',
          },
        },
        {
          id: 'unmapped-1',
          action_type: 'publish_founder_content',
          status: 'succeeded',
          success: true,
          request: { approvalId: 'fca:not-in-pattern-map' },
          result: {
            contract: 'fcr/first-party-founder-content-publish@v1',
            truthState: 'PUBLISHED',
            published: true,
            platform: 'linkedin',
            externalPostId: 'urn:li:share:999',
            permalink: 'https://www.linkedin.com/feed/update/urn:li:share:999/',
            publishedAt: '2026-08-31T12:00:00.000Z',
          },
        },
      ],
      patterns: [{
        approval_id: 'fca:unknown',
        pattern_fingerprint: identity.promptOsPatternFingerprint,
      }],
    });

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    expect(await repository.recentLinkedIn(32)).toEqual([]);
  });

  it('unions experiment and founder-attested pattern memory without retaining raw thesis or hook', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const attestedPattern = founderEditorialPatternFingerprint({
      thesis: identity.coreThesis,
      hook: identity.hook,
    });
    const { client } = historyClient({
      experiments: [{
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
      }],
      observations: [{
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
      }],
    });

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
    const { client } = historyClient({
      observations: [{
        resource_id: 'urn:li:activity:456',
        observed_state: {
          platform: 'linkedin',
          publication: { state: 'USER_ATTESTED', providerVerified: false },
          contentHash: 'd'.repeat(64),
        },
        observed_at: '2026-08-30T12:05:00.000Z',
      }],
    });

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    expect(await repository.recentLinkedIn(32)).toEqual([]);
  });
});
