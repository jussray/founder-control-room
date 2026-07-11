/**
 * MissionController
 *
 * Evaluates current evidence against the mission's required checks.
 * Advances mission status when evidence is complete and all required
 * checks pass. Blocks or flags when evidence is missing or failing.
 *
 * Does NOT automatically approve, merge, or deploy.
 * Those transitions require explicit founder approval.
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

    if (!missionId) return this.done('converged', 'No missionId');

    // Load mission with its required checks
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, status, required_checks, manifest_version_id, policy_snapshot')
      .eq('id', missionId)
      .eq('project_id', projectId)
      .single();

    if (missionError || !mission) {
      return this.done('retry', `Mission ${missionId} not found`);
    }

    const requiredChecks: EvidenceKind[] =
      mission.required_checks ?? mission.policy_snapshot?.requiredChecks ?? [];

    if (!requiredChecks.length) {
      return this.done('converged', 'No required checks defined for mission');
    }

    // Load latest evidence per kind for this mission
    const { data: evidenceRows } = await supabase
      .from('evidence')
      .select('kind, status, created_at')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false });

    // Reduce to latest status per kind
    const latestByKind = new Map<string, string>();
    for (const row of evidenceRows ?? []) {
      if (!latestByKind.has(row.kind)) {
        latestByKind.set(row.kind, row.status);
      }
    }

    const missing = requiredChecks.filter((k) => !latestByKind.has(k));
    const failing = requiredChecks.filter(
      (k) => latestByKind.get(k) === 'fail',
    );
    const passing = requiredChecks.filter(
      (k) => latestByKind.get(k) === 'pass',
    );
    const allPass = passing.length === requiredChecks.length;

    this.log('info', 'Mission evidence evaluated', {
      missionId,
      required: requiredChecks.length,
      passing: passing.length,
      failing: failing.length,
      missing: missing.length,
    });

    const observedChanges = [];
    const proposedActions: ProposedAction[] = [];

    // Determine next status
    let nextStatus: MissionStatus | null = null;
    const currentStatus = mission.status as MissionStatus;

    if (currentStatus === 'implementing') {
      if (allPass) {
        nextStatus = 'awaiting_approval';
        proposedActions.push({
          actionType: 'request_approval',
          resourceType: 'mission',
          resourceId: missionId,
          requiresApproval: true,
          idempotencyKey: this.idempotencyKey(
            projectId,
            missionId,
            'request_approval',
            'evidence-complete',
          ),
          payload: { evidenceSummary: Object.fromEntries(latestByKind) },
        });
      } else if (failing.length > 0) {
        // Stay in implementing; evidence failures are surfaced via proposedActions
        proposedActions.push({
          actionType: 'flag_failing_checks',
          resourceType: 'mission',
          resourceId: missionId,
          requiresApproval: false,
          idempotencyKey: this.idempotencyKey(projectId, missionId, 'flag_failing', failing.join(',')),
          payload: { failing },
        });
      }
    }

    // Apply status transition
    if (nextStatus && nextStatus !== currentStatus) {
      const { error: updateError } = await supabase
        .from('missions')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', missionId)
        .eq('status', currentStatus); // optimistic concurrency

      if (updateError) {
        return this.done('retry', `Status transition failed: ${updateError.message}`);
      }

      observedChanges.push({
        resourceType: 'mission',
        resourceId: missionId,
        field: 'status',
        previousValue: currentStatus,
        newValue: nextStatus,
      });

      this.log('info', 'Mission status advanced', {
        missionId,
        from: currentStatus,
        to: nextStatus,
      });
    }

    return {
      status: allPass ? 'converged' : missing.length > 0 ? 'drifted' : 'blocked',
      observedChanges,
      proposedActions,
      evidenceIds: [],
      requiresApproval: proposedActions.some((a) => a.requiresApproval),
    };
  }

  private done(status: ReconcileResult['status'], message: string): ReconcileResult {
    return {
      status,
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      message,
    };
  }
}
