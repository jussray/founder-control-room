import { describe, expect, it } from 'vitest';
import { classifyMergeAuthority } from '../mergeAuthorityBoundary.js';

describe('merge authority boundary', () => {
  it('keeps every pull request lifecycle state proposal-only until policy is merged into current main', () => {
    for (const state of ['open', 'draft', 'closed-unmerged', 'superseded', 'merged'] as const) {
      expect(classifyMergeAuthority({
        kind: 'pull-request-proposal',
        state,
        prNumber: 426,
      })).toEqual({ authoritative: false, reason: 'proposal-only' });
    }
  });

  it('accepts only policy that is merged and identical to current main', () => {
    const sha = 'a'.repeat(40);
    expect(classifyMergeAuthority({
      kind: 'current-main-policy',
      policySha: sha,
      currentMainSha: sha,
      merged: true,
    })).toEqual({ authoritative: true, reason: 'current-main-policy' });

    expect(classifyMergeAuthority({
      kind: 'current-main-policy',
      policySha: 'b'.repeat(40),
      currentMainSha: sha,
      merged: true,
    }).authoritative).toBe(false);

    expect(classifyMergeAuthority({
      kind: 'current-main-policy',
      policySha: sha,
      currentMainSha: sha,
      merged: false,
    }).authoritative).toBe(false);
  });

  it('requires provider readback before provider enforcement is authoritative', () => {
    expect(classifyMergeAuthority({
      kind: 'provider-enforcement',
      providerReadbackObserved: true,
    })).toEqual({ authoritative: true, reason: 'provider-readback' });

    expect(classifyMergeAuthority({
      kind: 'provider-enforcement',
      providerReadbackObserved: false,
    }).authoritative).toBe(false);
  });

  it('requires fresh authenticated exact-head Current You authorization', () => {
    const head = 'c'.repeat(40);
    expect(classifyMergeAuthority({
      kind: 'current-you-authorization',
      authenticated: true,
      exactHeadSha: head,
      approvedHeadSha: head,
      fresh: true,
      revoked: false,
    })).toEqual({ authoritative: true, reason: 'fresh-current-you' });

    for (const source of [
      { authenticated: false, exactHeadSha: head, approvedHeadSha: head, fresh: true, revoked: false },
      { authenticated: true, exactHeadSha: head, approvedHeadSha: 'd'.repeat(40), fresh: true, revoked: false },
      { authenticated: true, exactHeadSha: head, approvedHeadSha: head, fresh: false, revoked: false },
      { authenticated: true, exactHeadSha: head, approvedHeadSha: head, fresh: true, revoked: true },
    ]) {
      expect(classifyMergeAuthority({ kind: 'current-you-authorization', ...source }).authoritative).toBe(false);
    }
  });
});
