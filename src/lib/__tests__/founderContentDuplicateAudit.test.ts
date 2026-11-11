import { describe, expect, it } from 'vitest';
import { auditForDuplicatePost, type PriorPostSummary } from '../founderContentDuplicateAudit.js';

function prior(overrides: Partial<PriorPostSummary> = {}): PriorPostSummary {
  return {
    postId: 'post-1',
    platform: 'linkedin',
    sourceRepository: 'jussray/example',
    text: 'We shipped verified progress this week on the founder control room. https://github.com/jussray/example',
    ...overrides,
  };
}

describe('auditForDuplicatePost', () => {
  it('reports no duplicate when there is no history to compare against', () => {
    const result = auditForDuplicatePost('Some new post text that is reasonably long.', []);
    expect(result.isDuplicate).toBe(false);
    expect(result.matchedPostId).toBeNull();
    expect(result.similarity).toBe(0);
  });

  it('flags an exact-text repost as a duplicate', () => {
    const text = 'We shipped verified progress this week on the founder control room.';
    const result = auditForDuplicatePost(text, [prior({ text })]);
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedPostId).toBe('post-1');
    expect(result.similarity).toBe(1);
  });

  it('flags a lightly reworded repost as a near-duplicate', () => {
    const result = auditForDuplicatePost(
      'We shipped verified progress this week on the founder control room, with full proof attached.',
      [prior()],
    );
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedPostId).toBe('post-1');
    expect(result.similarity).toBeGreaterThan(0.8);
  });

  it('does not flag genuinely different content about a different shipped feature', () => {
    const result = auditForDuplicatePost(
      'Today we rolled out a brand new lane health dashboard with live Playwright proof for every state transition.',
      [prior()],
    );
    expect(result.isDuplicate).toBe(false);
    expect(result.matchedPostId).toBeNull();
  });

  it('ignores proof URLs when comparing, since legitimate distinct posts repeat the same proof link', () => {
    const result = auditForDuplicatePost(
      'https://github.com/jussray/example',
      [prior({ text: 'https://github.com/jussray/example' })],
    );
    // Both texts collapse to nothing once the URL is stripped — not treated as meaningfully duplicate content.
    expect(result.matchedPostId).toBeNull();
  });

  it('excludes a prior post that was rejected and never actually posted', () => {
    const text = 'We shipped verified progress this week on the founder control room.';
    const result = auditForDuplicatePost(text, [prior({ text, status: 'rejected' })]);
    expect(result.isDuplicate).toBe(false);
  });

  it('respects a caller-supplied similarity threshold', () => {
    // Shares its first six words with `priorText` (four overlapping 3-word
    // shingles out of seven), then diverges — a partial, not total, match.
    const priorText = 'alpha bravo charlie delta echo foxtrot golf hotel india';
    const partialOverlapText = 'alpha bravo charlie delta echo foxtrot zulu yankee xray';

    const loose = auditForDuplicatePost(
      partialOverlapText,
      [prior({ text: priorText })],
      { similarityThreshold: 0.99 },
    );
    expect(loose.isDuplicate).toBe(false);

    const strict = auditForDuplicatePost(
      partialOverlapText,
      [prior({ text: priorText })],
      { similarityThreshold: 0.1 },
    );
    expect(strict.isDuplicate).toBe(true);
  });

  it('matches the single most similar prior post among several', () => {
    const text = 'We shipped verified progress this week on the founder control room.';
    const result = auditForDuplicatePost(text, [
      prior({ postId: 'post-unrelated', text: 'A completely unrelated update about billing.' }),
      prior({ postId: 'post-exact', text }),
    ]);
    expect(result.matchedPostId).toBe('post-exact');
    expect(result.similarity).toBe(1);
  });
});
