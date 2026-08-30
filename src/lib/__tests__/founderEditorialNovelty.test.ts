import { describe, expect, it, vi } from 'vitest';
import {
  buildFounderEditorialIdentity,
  evaluateFounderEditorialNovelty,
  supabaseFounderEditorialHistoryRepository,
  type FounderEditorialHistoryRepository,
} from '../founderEditorialNovelty.js';

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    source: { repo: 'jussray/founder-control-room', commit_sha: 'a'.repeat(40) },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'I stopped building separate AI apps. I am building one founder machine with different jobs.',
      public_claims: [{
        text: 'PromptOS, Chief, and Founder Control Room are converging into one founder operating system.',
      }],
    },
    internal_evidence: {
      ref: 'github:jussray/founder-control-room@a#convergence',
      digest: 'b'.repeat(64),
    },
    ...overrides,
  };
}

function history(records: Array<{
  id: string;
  coreThesis: string;
  primaryHook: string;
  angle?: string;
  meaningfulChange?: string | null;
  relatedProject?: string | null;
}>): FounderEditorialHistoryRepository {
  return {
    recentLinkedIn: vi.fn(async () => records.map((item) => ({
      id: item.id,
      relatedProject: item.relatedProject === undefined ? 'fcr' : item.relatedProject,
      coreThesis: item.coreThesis,
      primaryHook: item.primaryHook,
      angle: item.angle ?? '',
      meaningfulChange: item.meaningfulChange ?? null,
      hookType: 'Build-in-public',
      proofStyle: 'Technical proof',
      publishDate: '2026-08-29',
      status: 'published',
    }))),
  };
}

describe('founder editorial novelty', () => {
  it('binds PromptOS pattern, Chief angle, and the final story into deterministic fingerprints', () => {
    const first = buildFounderEditorialIdentity(proposal());
    const second = buildFounderEditorialIdentity(proposal());

    expect(first.storyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.promptOsPatternFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.chiefAngleFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toEqual(first);
    expect(first.lane).toBe('founder-machine');
  });

  it('rejects a recycled thesis and hook even when it arrives as a new Chief proposal', async () => {
    const repository = history([{
      id: 'prior-verification-post',
      coreThesis: 'PromptOS Chief and Founder Control Room are converging into one founder operating system.',
      primaryHook: 'I stopped building separate AI apps. I am building one founder machine with different jobs.',
      angle: 'one founder machine',
    }]);

    const result = await evaluateFounderEditorialNovelty({ proposal: proposal(), historyRepository: repository });

    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('HIGH');
    expect(result.closestMatchId).toBe('prior-verification-post');
    expect(result.closestSimilarity).toBeGreaterThanOrEqual(0.55);
    expect(result.reason).toContain('materially different story angle');
    expect(result.roles).toEqual({
      promptos: 'editorial-pattern-grammar',
      chief: 'candidate-angle-proposal',
      fcr: 'history-readback-and-approval-gate',
    });
    expect(result.authority).toEqual({ publish: false, approve: false, schedule: false });
  });

  it('keeps any exact portfolio pattern HIGH even when another project ranks closer by token similarity', async () => {
    const repository = history([
      {
        id: 'sekret-same-pattern',
        relatedProject: 'Se’kret Bip',
        coreThesis: 'PromptOS, Chief, and Founder Control Room are converging into one founder operating system.',
        primaryHook: 'I stopped building separate AI apps.',
        angle: 'architecture boundaries governance provider reconciliation session continuity runtime deployment founder workflow design visual system company operations build log internal tooling product strategy orchestration',
        meaningfulChange: 'This historical product record contains deliberately verbose unrelated notes that dilute token similarity without changing the exact thesis and hook pattern.',
      },
      {
        id: 'semantic-distractor',
        relatedProject: 'Chief',
        coreThesis: 'Founder Control Room and Chief are one system for building AI products.',
        primaryHook: '',
      },
    ]);

    const result = await evaluateFounderEditorialNovelty({ proposal: proposal(), historyRepository: repository });

    expect(result.closestMatchId).toBe('semantic-distractor');
    expect(result.closestSimilarity).toBeGreaterThan(0.35);
    expect(result.closestSimilarity).toBeLessThan(0.55);
    expect(result.risk).toBe('HIGH');
    expect(result.allowed).toBe(false);
  });

  it('allows a materially different story while preserving the closest-match receipt', async () => {
    const repository = history([{
      id: 'old-proof-post',
      coreThesis: 'AI agents need exact runtime proof before a completed claim is trusted.',
      primaryHook: 'A green checkmark is not proof that an AI agent finished the job.',
      angle: 'verification and runtime truth',
    }]);

    const result = await evaluateFounderEditorialNovelty({ proposal: proposal(), historyRepository: repository });

    expect(result.allowed).toBe(true);
    expect(result.risk).not.toBe('HIGH');
    expect(result.historyState).toBe('COMPARED');
    expect(result.comparedCount).toBe(1);
    expect(result.storyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.continuityCookie).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rotates the Chief angle and story fingerprint when event/proof changes without pretending that proves novelty', () => {
    const first = buildFounderEditorialIdentity(proposal());
    const second = buildFounderEditorialIdentity(proposal({
      internal_evidence: {
        ref: 'github:jussray/founder-control-room@c#different-event',
        digest: 'd'.repeat(64),
      },
    }));

    expect(second.promptOsPatternFingerprint).toBe(first.promptOsPatternFingerprint);
    expect(second.chiefAngleFingerprint).not.toBe(first.chiefAngleFingerprint);
    expect(second.storyFingerprint).not.toBe(first.storyFingerprint);
  });

  it('does not query LinkedIn history for a non-LinkedIn proposal', async () => {
    const repository = history([]);
    const result = await evaluateFounderEditorialNovelty({
      proposal: proposal({
        public_payload: {
          platform: 'facebook',
          story_type: 'founder-progress',
          draft_text: 'A Facebook-specific founder update.',
          public_claims: [{ text: 'A Facebook-specific founder update.' }],
        },
      }),
      historyRepository: repository,
    });

    expect(result.allowed).toBe(true);
    expect(result.historyState).toBe('NOT_APPLICABLE');
    expect(repository.recentLinkedIn).not.toHaveBeenCalled();
  });

  it('orders dated LinkedIn history before null publish dates before applying the bounded window', async () => {
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(async () => ({ data: [], error: null }));
    const client = {
      from: vi.fn(() => query),
    };

    const repository = supabaseFounderEditorialHistoryRepository(client as any);
    await repository.recentLinkedIn(32);

    expect(client.from).toHaveBeenCalledWith('linkedin_experiments');
    expect(query.order).toHaveBeenCalledWith('publish_date', { ascending: false, nullsFirst: false });
    expect(query.limit).toHaveBeenCalledWith(32);
    expect(query.order.mock.invocationCallOrder[0]).toBeLessThan(query.limit.mock.invocationCallOrder[0]);
  });
});