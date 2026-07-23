import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import { MissionController } from '../MissionController.js';

const PROJECT_ID = 'project-uuid-001';
const MISSION_ID = 'mission-uuid-001';
const EXPECTED_SHA = 'a'.repeat(40);

function missionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MISSION_ID,
    status: 'sandboxed',
    base_ref: 'main',
    required_checks: ['typecheck', 'deployment_result'],
    manifest_version_id: null,
    policy_snapshot: { expectedHeadSha: EXPECTED_SHA, rollbackPath: 'Revert the integration commit.' },
    branch_ref: 'mission/test',
    ...overrides,
  };
}

/** Wires the shared supabase mock: lease acquisition, mission read, evidence read, mission update. */
function stubReconcileStack(evidenceRows: Array<{ kind: string; status: string; commit_sha: string; provider: string | null; created_at: string }>) {
  mockRpc.mockResolvedValue({ data: true, error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'controller_leases') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { claimed_at: 'claim-token' }, error: null }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    }
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: missionRow(), error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    }
    if (table === 'evidence') {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: evidenceRows, error: null }),
          }),
        }),
      };
    }
    return {};
  });
}

describe('MissionController evidence provider enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not advance sandboxed to in_review when deployment_result evidence is self-reported, not webhook-verified', async () => {
    stubReconcileStack([
      { kind: 'typecheck', status: 'pass', commit_sha: EXPECTED_SHA, provider: 'github', created_at: new Date().toISOString() },
      { kind: 'deployment_result', status: 'pass', commit_sha: EXPECTED_SHA, provider: 'custom', created_at: new Date().toISOString() },
    ]);

    const controller = new MissionController();
    const result = await controller.run({ projectId: PROJECT_ID, controller: 'MissionController', resourceId: MISSION_ID, reason: 'provider_event' });

    expect(result.status).not.toBe('converged');
    const flagged = result.proposedActions.find((action) => action.actionType === 'flag_failing_checks');
    expect(flagged).toBeDefined();
    expect((flagged?.payload as { wrongProvider?: string[] })?.wrongProvider).toEqual(['deployment_result']);
  });

  it('advances sandboxed to in_review once deployment_result evidence is webhook-verified', async () => {
    stubReconcileStack([
      { kind: 'typecheck', status: 'pass', commit_sha: EXPECTED_SHA, provider: 'github', created_at: new Date().toISOString() },
      { kind: 'deployment_result', status: 'pass', commit_sha: EXPECTED_SHA, provider: 'github', created_at: new Date().toISOString() },
    ]);

    const controller = new MissionController();
    const result = await controller.run({ projectId: PROJECT_ID, controller: 'MissionController', resourceId: MISSION_ID, reason: 'provider_event' });

    const approval = result.proposedActions.find((action) => action.actionType === 'request_approval');
    expect(approval).toBeDefined();
  });
});
