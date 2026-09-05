import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {},
}));

import {
  buildPortfolioLedgerProjection,
  PORTFOLIO_LEDGER_PROJECTION_CONTRACT,
} from '../PortfolioLedgerProjectionController.js';

const MERGE_SHA = 'c'.repeat(40);
const HEAD_SHA = 'a'.repeat(40);

function observation() {
  return {
    projectId: 'project-123',
    sourceEventId: 'event-123',
    repository: 'jussray/JussBeautifulHair-Site',
    pullRequestNumber: 99,
    title: 'Ship verified storefront change',
    targetBranch: 'main',
    mergeCommitSha: MERGE_SHA,
    reviewedHeadSha: HEAD_SHA,
    updatedAt: '2026-09-04T15:00:00Z',
  };
}

describe('portfolio ledger projection contract', () => {
  it('projects landed GitHub source truth without promoting runtime authority', () => {
    const projection = buildPortfolioLedgerProjection(observation());

    expect(projection.contract).toBe(PORTFOLIO_LEDGER_PROJECTION_CONTRACT);
    expect(projection.projectionId).toBe(`github-merge:jussray/jussbeautifulhair-site:${MERGE_SHA}`);
    expect(projection.idempotencyKey).toBe(projection.projectionId);
    expect(projection.authority).toBe('observed');
    expect(projection.authorizing).toBe(false);
    expect(projection.source).toEqual(expect.objectContaining({
      provider: 'github',
      repository: 'jussray/JussBeautifulHair-Site',
      pullRequestNumber: 99,
      reviewedHeadSha: HEAD_SHA,
      mergeCommitSha: MERGE_SHA,
      targetBranch: 'main',
    }));
    expect(projection.target).toEqual({
      provider: 'google-sheets',
      workbook: 'ULTRATHINK Portfolio Proof Orientation Ledger',
      tab: 'Orientation Ledger',
      mode: 'upsert',
      valueInputOption: 'RAW',
      rowKey: 'github:jussray/jussbeautifulhair-site',
    });
    expect(projection.row.classification).toBe('VERIFIED');
    expect(projection.row.currentReality).toContain(MERGE_SHA);
    expect(projection.row.proofGate).toContain('runtime and deployment proof remain separate');
    expect(projection.row.nextGate).toContain('runtime witness');
    expect(projection.continuity).toEqual({
      browserCookie: false,
      authorizing: false,
      approvalCarryForward: false,
      standingMutationAuthority: false,
    });
  });

  it('is deterministic for the same observed merge and changes identity when landed SHA changes', () => {
    const first = buildPortfolioLedgerProjection(observation());
    const second = buildPortfolioLedgerProjection(observation());
    const successor = buildPortfolioLedgerProjection({
      ...observation(),
      mergeCommitSha: 'd'.repeat(40),
    });

    expect(second).toEqual(first);
    expect(successor.projectionId).not.toBe(first.projectionId);
    expect(successor.target.rowKey).toBe(first.target.rowKey);
  });
});
