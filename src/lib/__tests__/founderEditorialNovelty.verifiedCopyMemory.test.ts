import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildFounderEditorialIdentity,
  evaluateFounderEditorialNovelty,
  supabaseFounderEditorialHistoryRepository,
  type FounderEditorialHistoryRepository,
} from '../founderEditorialNovelty.js';

function proposal() {
  return {
    source: { repo: 'jussray/founder-control-room', commit_sha: 'a'.repeat(40) },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'The exact public copy must remain remembered after provider verification.',
      public_claims: [{ text: 'Founder Control Room remembers provider-verified copy.' }],
    },
    internal_evidence: {
      ref: 'github:jussray/founder-control-room@a#verified-copy-memory',
      digest: 'b'.repeat(64),
    },
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

function historyClient(input: { executions?: unknown[]; patterns?: unknown[] }) {
  const experiments = query([]);
  const observations = query([]);
  const executions = query(input.executions ?? []);
  const patterns = query(input.patterns ?? []);
  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === 'linkedin_experiments') return experiments;
        if (table === 'provider_observations') return observations;
        if (table === 'approval_executions') return executions;
        if (table === 'founder_content_approval_editorial_pattern_history') return patterns;
        throw new Error(`unexpected table ${table}`);
      }),
    },
  };
}

describe('provider-verified exact-copy novelty memory', () => {
  it('uses the same exact SHA-256 identity as the canonical public-copy fingerprint', () => {
    const value = proposal();
    const identity = buildFounderEditorialIdentity(value);
    const exactCopy = String(value.public_payload.draft_text).trim();
    const expected = createHash('sha256').update(exactCopy, 'utf8').digest('hex');
    expect(identity.publicCopyFingerprint).toBe(expected);
  });

  it('retains a verified direct-publication copy hash only when request and readback agree', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const { client } = historyClient({
      executions: [{
        id: 'execution-copy-1',
        action_type: 'publish_founder_content',
        status: 'succeeded',
        success: true,
        request: {
          approvalId: 'fca:copy-verified',
          publicPayloadHash: 'c'.repeat(64),
          publicCopyHash: identity.publicCopyFingerprint,
        },
        result: {
          contract: 'fcr/first-party-founder-content-publish@v1',
          truthState: 'PUBLISHED',
          published: true,
          platform: 'linkedin',
          externalPostId: 'urn:li:share:copy-1',
          permalink: 'https://www.linkedin.com/feed/update/urn:li:share:copy-1/',
          publishedAt: '2026-09-05T02:00:00.000Z',
          publicCopyHash: identity.publicCopyFingerprint,
        },
        executed_at: '2026-09-05T02:00:01.000Z',
      }],
      patterns: [{
        approval_id: 'fca:copy-verified',
        pattern_fingerprint: 'd'.repeat(64),
        bound_at: '2026-09-05T01:59:00.000Z',
      }],
    });

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    const rows = await repository.recentLinkedIn(32);
    expect(rows).toHaveLength(1);
    expect(rows[0].publicCopyHash).toBe(identity.publicCopyFingerprint);
    expect(rows[0].promptOsPatternFingerprint).toBe('d'.repeat(64));
  });

  it('blocks an exact verified copy even when its stored thesis/hook pattern is different', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const historyRepository: FounderEditorialHistoryRepository = {
      recentLinkedIn: vi.fn(async () => [{
        id: 'provider-readback:urn:li:share:copy-2',
        relatedProject: null,
        coreThesis: '',
        primaryHook: '',
        angle: '',
        meaningfulChange: null,
        hookType: null,
        proofStyle: 'provider-verified-editorial-pattern',
        publishDate: '2026-09-05T02:00:00.000Z',
        status: 'published',
        promptOsPatternFingerprint: 'e'.repeat(64),
        publicPayloadHash: 'f'.repeat(64),
        publicCopyHash: identity.publicCopyFingerprint,
        historySource: 'provider_readback' as const,
      }]),
    };

    const result = await evaluateFounderEditorialNovelty({ proposal: proposal(), historyRepository });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('HIGH');
    expect(result.closestMatchId).toBe('provider-readback:urn:li:share:copy-2');
    expect(result.closestSimilarity).toBe(0);
    expect(result.reason).toContain('provider-verified exact public copy');
  });

  it('does not manufacture exact-copy memory when request and provider readback hashes disagree', async () => {
    const identity = buildFounderEditorialIdentity(proposal());
    const { client } = historyClient({
      executions: [{
        id: 'execution-copy-conflict',
        action_type: 'publish_founder_content',
        status: 'succeeded',
        success: true,
        request: {
          approvalId: 'fca:copy-conflict',
          publicPayloadHash: 'c'.repeat(64),
          publicCopyHash: identity.publicCopyFingerprint,
        },
        result: {
          contract: 'fcr/first-party-founder-content-publish@v1',
          truthState: 'PUBLISHED',
          published: true,
          platform: 'linkedin',
          externalPostId: 'urn:li:share:copy-conflict',
          permalink: 'https://www.linkedin.com/feed/update/urn:li:share:copy-conflict/',
          publishedAt: '2026-09-05T02:00:00.000Z',
          publicCopyHash: '9'.repeat(64),
        },
      }],
      patterns: [{
        approval_id: 'fca:copy-conflict',
        pattern_fingerprint: '8'.repeat(64),
      }],
    });

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    const rows = await repository.recentLinkedIn(32);
    expect(rows).toHaveLength(1);
    expect(rows[0].publicCopyHash).toBeNull();
  });
});
