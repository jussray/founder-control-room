/**
 * MissionController
 *
 * Evaluates current evidence against the mission's required checks.
 * Advances mission status when evidence is complete and all required
 * checks pass. Blocks or flags when evidence is missing or failing.
 *
 * Does NOT automatically approve, merge, or deploy.
 * Those transitions require explicit founder approval.
 *
 * Proposed actions are persisted to the proposed_actions table so the
 * approvals route can verify exact-match before executing any GitHub write.
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import type {
  ReconcileRequest,
  ReconcileResult,
  ProposedAction,
  EvidenceKind,
} from '../reconciliation/types.js';

type MissionStatus =
  | 'scoping'
  | 'planned'
  | 'implementing'
  | 'preview_ready'
  | 'awaiting_approval'
  | 'deploying'
  | 'verifying'
  | 'completed'
  | 'rolled_back'
  | 'failed';

export class MissionController extends BaseController {
  readonly name = 'MissionController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId: missionId } = req;

    if (!missionId) return this.skip('No missionId');

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, status, required_checks, manifest_version_id, policy_snapshot, branch_name')
      .eq('id', missionId)
      .eq('project_id', projectId)
      .single();

    if (missionError || !mission) {
      return this.retry(`Mission ${missionId} not found`);
    }

    const currentStatus = mission.status as MissionStatus;
    const observedChanges = [];
    const proposedActions: ProposedAction[] = [];

    // -----------------------------------------------------------------------
    // Branch proposal
    // When a mission is 'planned' or 'implementing' with no branch yet,
    // propose creating one — persisted to proposed_actions.
    // -----------------------------------------------------------------------
    if (
      (currentStatus === 'planned' || currentStatus === 'implementing') &&
      !mission.branch_name
    ) {
      const branchName = `mission/${missionId.slice(0, 8)}`;
      const idempotencyKey = this.idempotencyKey(projectId, missionId, 'create_branch', 'initial');

      await this.persistProposedAction({
        missionId,
        projectId,
        actionType: 'create_branch',
        idempotencyKey,
        branchName,
        baseBranch: 'main',
        payload: { branchName, baseRef: 'main' },
        evidenceSnapshot: {},
        expectedMissionStatus: currentStatus,
      });

      proposedActions.push({
        actionType: 'create_branch',
        resourceType: 'mission',
        resourceId: missionId,
        requiresApproval: true,
        idempotencyKey,
        payload: { branchName, baseRef: 'main' },
      });

      this.log('info', 'Proposed branch creation persisted', { missionId, branchName });

      return {
        status: 'drifted',
        observedChanges: [],
        proposedActions,
        evidenceIds: [],
        requiresApproval: true,
        message: 'Branch not yet created — awaiting approval',
      };
    }

    // -----------------------------------------------------------------------
    // Evidence evaluation
    // -----------------------------------------------------------------------
    const requiredChecks: EvidenceKind[] =
      mission.required_checks ?? mission.policy_snapshot?.requiredChecks ?? [];

    if (!requiredChecks.length) {
      return this.skip('No required checks defined for mission');
    }

    const { data: evidenceRows } = await supabase
      .from('evidence')
      .select('kind, status, created_at')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false });

    const latestByKind = new Map<string, string>();
    for (const row of evidenceRows ?? []) {
      if (!latestByKind.has(row.kind)) {
        latestByKind.set(row.kind, row.status);
      }
    }

    const missing = requiredChecks.filter((k) => !latestByKind.has(k));
    const failing = requiredChecks.filter((k) => latestByKind.get(k) === 'fail');
    const passing = requiredChecks.filter((k) => latestByKind.get(k) === 'pass');
    const allPass = passing.length === requiredChecks.length;

    this.log('info', 'Mission evidence evaluated', {
      missionId,
      required: requiredChecks.length,
      passing: passing.length,
      failing: failing.length,
      missing: missing.length,
    });

    let nextStatus: MissionStatus | null = null;

    // -----------------------------------------------------------------------
    // Propose merge when all evidence passes and mission is awaiting_approval
    // -----------------------------------------------------------------------
    if (currentStatus === 'implementing' && allPass) {
      nextStatus = 'awaiting_approval';
    }

    if (currentStatus === 'awaiting_approval' && mission.branch_name && allPass) {
      // Derive head SHA from the latest change proposal for this mission's branch
      const { data: cp } = await supabase
        .from('change_proposals')
        .select('head_sha, head_branch, base_branch')
        .eq('project_id', projectId)
        .eq('head_branch', mission.branch_name)
        .eq('status', 'open')
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cp?.head_sha) {
        const evidenceSnapshot = Object.fromEntries(latestByKind);
        const idempotencyKey = this.idempotencyKey(
          projectId,
          missionId,
          'merge',
          cp.head_sha,
        );

        await this.persistProposedAction({
          missionId,
          projectId,
          actionType: 'merge',
          idempotencyKey,
          headBranch: cp.head_branch,
          baseBranch: cp.base_branch ?? 'main',
          headSha: cp.head_sha,
          payload: { head: cp.head_branch, base: cp.base_branch ?? 'main', headSha: cp.head_sha },
          evidenceSnapshot,
          expectedMissionStatus: 'awaiting_approval',
        });

        proposedActions.push({
          actionType: 'merge',
          resourceType: 'mission',
          resourceId: missionId,
          requiresApproval: true,
          idempotencyKey,
          payload: { head: cp.head_branch, base: cp.base_branch ?? 'main', headSha: cp.head_sha },
        });

        this.log('info', 'Proposed merge persisted', { missionId, headSha: cp.head_sha });
      }
    }

    if (currentStatus === 'verifying' && allPass) {
      nextStatus = 'completed';
    }

    if (currentStatus === 'implementing' && failing.length > 0) {
      proposedActions.push({
        actionType: 'flag_failing_checks',
        resourceType: 'mission',
        resourceId: missionId,
        requiresApproval: false,
        idempotencyKey: this.idempotencyKey(projectId, missionId, 'flag_failing', failing.join(',')),
        payload: { failing },
      });
    }

    if (nextStatus && nextStatus !== currentStatus) {
      const { error: updateError } = await supabase
        .from('missions')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', missionId)
        .eq('status', currentStatus);

      if (updateError) {
        return this.retry(`Status transition failed: ${updateError.message}`);
      }

      observedChanges.push({
        resourceType: 'mission',
        resourceId: missionId,
        field: 'status',
        previousValue: currentStatus,
        newValue: nextStatus,
      });

      this.log('info', 'Mission status advanced', { missionId, from: currentStatus, to: nextStatus });
    }

    return {
      status: allPass ? 'converged' : missing.length > 0 ? 'drifted' : 'blocked',
      observedChanges,
      proposedActions,
      evidenceIds: [],
      requiresApproval: proposedActions.some((a) => a.requiresApproval),
    };
  }

  /**
   * Persist a proposed action to the DB, idempotent on idempotency_key.
   * Upsert with ignoreDuplicates so re-runs don't overwrite a claimed action.
   */
  private async persistProposedAction(params: {
    missionId: string;
    projectId: string;
    actionType: 'create_branch' | 'merge';
    idempotencyKey: string;
    headBranch?: string;
    baseBranch?: string;
    headSha?: string;
    branchName?: string;
    payload: Record<string, unknown>;
    evidenceSnapshot: Record<string, string>;
    expectedMissionStatus: string;
  }): Promise<void> {
    const { error } = await supabase.from('proposed_actions').upsert(
      {
        mission_id: params.missionId,
        project_id: params.projectId,
        action_type: params.actionType,
        idempotency_key: params.idempotencyKey,
        head_branch: params.headBranch ?? null,
        base_branch: params.baseBranch ?? null,
        head_sha: params.headSha ?? null,
        branch_name: params.branchName ?? null,
        payload: params.payload,
        evidence_snapshot: params.evidenceSnapshot,
        expected_mission_status: params.expectedMissionStatus,
        status: 'pending',
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );
    if (error) {
      this.log('error', 'Failed to persist proposed action', { error: error.message });
    }
  }

  private skip(message: string): ReconcileResult {
    return { status: 'converged', observedChanges: [], proposedActions: [], evidenceIds: [], requiresApproval: false, message };
  }

  private retry(message: string): ReconcileResult {
    return { status: 'retry', observedChanges: [], proposedActions: [], evidenceIds: [], requiresApproval: false, message, retryAfter: new Date(Date.now() + 10_000).toISOString() };
  }
}
