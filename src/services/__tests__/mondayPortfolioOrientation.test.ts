import { describe, expect, it } from 'vitest';
import {
  buildMondayPortfolioOrientation,
  mondayPortfolioOrientationWeekKey,
  renderMondayPortfolioOrientation,
} from '../mondayPortfolioOrientation.js';

describe('Monday portfolio orientation', () => {
  it('becomes due at 08:00 America/New_York and stays due for later retry ticks that Monday', () => {
    expect(mondayPortfolioOrientationWeekKey(new Date('2026-10-05T11:59:00Z'))).toBeNull();
    expect(mondayPortfolioOrientationWeekKey(new Date('2026-10-05T12:00:00Z'))).toBe('2026-10-05');
    expect(mondayPortfolioOrientationWeekKey(new Date('2026-10-05T21:30:00Z'))).toBe('2026-10-05');
    expect(mondayPortfolioOrientationWeekKey(new Date('2026-10-06T12:00:00Z'))).toBeNull();
  });

  it('orders proof-critical blockers ahead of unknown, routine, and already-verified work', () => {
    const orientation = buildMondayPortfolioOrientation({
      now: new Date('2026-10-05T12:00:00Z'),
      weekKey: '2026-10-05',
      projects: [
        { id: 'fcr', slug: 'founder-control-room', repo_identifier: 'jussray/founder-control-room' },
        { id: 'bip', slug: 'sekret-bip', repo_identifier: 'jussray/Sekret-Bip' },
        { id: 'chief', slug: 'chief-ai-machine', repo_identifier: 'jussray/chief-ai-machine' },
        { id: 'sync', slug: 'sync-party', repo_identifier: 'jussray/sync-party-game' },
      ],
      verificationRuns: [
        {
          project_id: 'fcr', repository_identifier: 'jussray/founder-control-room', branch: 'main',
          commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', overall_status: 'passed',
          signature_verified: true, scanned_at: '2026-10-05T11:50:00Z', received_at: '2026-10-05T11:51:00Z',
        },
        {
          project_id: 'bip', repository_identifier: 'jussray/Sekret-Bip', branch: 'main',
          commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', overall_status: 'failed',
          signature_verified: false, scanned_at: '2026-10-05T11:40:00Z', received_at: '2026-10-05T11:41:00Z',
        },
        {
          project_id: 'sync', repository_identifier: 'jussray/sync-party-game', branch: 'main',
          commit_sha: 'cccccccccccccccccccccccccccccccccccccccc', overall_status: 'warning',
          signature_verified: false, scanned_at: '2026-10-05T11:30:00Z', received_at: '2026-10-05T11:31:00Z',
        },
      ],
      findings: [
        {
          project_id: 'fcr', severity: 'critical', title: 'Exact-head proof is blocked',
          suggested_action: 'Repair the first failing proof lane.', last_seen_at: '2026-10-05T11:55:00Z',
        },
      ],
    });

    expect(orientation.proofCriticalBlockers.map((item) => item.project)).toEqual([
      'founder-control-room',
      'sekret-bip',
    ]);
    expect(orientation.unknown.map((item) => item.project)).toEqual(['chief-ai-machine']);
    expect(orientation.routine.map((item) => item.project)).toEqual(['sync-party']);
    expect(orientation.verified).toEqual([]);
    expect(orientation.orderOfOperations[0]).toContain('founder-control-room');
    expect(orientation.orderOfOperations[1]).toContain('sekret-bip');
  });

  it('keeps verified work separate and labels unavailable Gmail, Calendar, and Chief ranking instead of inventing coverage', () => {
    const orientation = buildMondayPortfolioOrientation({
      now: new Date('2026-10-05T12:00:00Z'),
      weekKey: '2026-10-05',
      projects: [{ id: 'fcr', slug: 'founder-control-room', repo_identifier: 'jussray/founder-control-room' }],
      verificationRuns: [{
        project_id: 'fcr', repository_identifier: 'jussray/founder-control-room', branch: 'main',
        commit_sha: 'dddddddddddddddddddddddddddddddddddddddd', overall_status: 'passed',
        signature_verified: true, scanned_at: '2026-10-05T11:50:00Z', received_at: '2026-10-05T11:51:00Z',
      }],
      findings: [],
    });

    expect(orientation.verified).toHaveLength(1);
    expect(orientation.proofCriticalBlockers).toHaveLength(0);
    expect(orientation.sourceStatus.calendar).toBe('UNAVAILABLE_SCOPE_NOT_PROVEN');
    expect(orientation.sourceStatus.gmail).toBe('UNAVAILABLE_SCOPE_NOT_PROVEN');
    expect(orientation.sourceStatus.chief).toBe('PROPOSAL_ONLY_NO_WEEKLY_RANKING_RPC');

    const text = renderMondayPortfolioOrientation(orientation);
    expect(text).toContain('PROOF-CRITICAL BLOCKERS:\n- None evidenced.');
    expect(text).toContain('VERIFIED / NO FOUNDER ACTION:');
    expect(text).toContain('Calendar: UNAVAILABLE_SCOPE_NOT_PROVEN');
    expect(text).toContain('Gmail: UNAVAILABLE_SCOPE_NOT_PROVEN');
    expect(text).toContain('Chief: PROPOSAL_ONLY_NO_WEEKLY_RANKING_RPC');
  });
});
