/**
 * MissionController
 *
 * Evaluates current evidence against the mission's required checks.
 * Advances mission status when evidence is complete, all required
 * checks pass, AND the proof gate clears.
 * Blocks or flags when evidence is missing, failing, or the gate rejects.
 *
 * Does NOT automatically approve, merge, or deploy.
 * Those transitions require explicit founder approval.
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import { runProofGate } from '../proof-gate/gate.js';
import type {
  ReconcileRequest,
  ReconcileResult,
  ProposedAction,
  EvidenceKind,
} from '../reconciliation/types.js';
import type { ProofEvidence } from '../proof-gate/types.js';

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

    if (!missionId) return this.noOp('No missionId');

    // Load mission with its required checks
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, status, required_checks, manifest_version_id, policy_snapshot')
      .eq('id', missionId)
      .eq('project_id', projectId)
      .single();

    if (missionError || !mission) {
      return this.noOp(`Mission ${missionId} not found`, 'retry');
    }

    const requiredChecks: EvidenceKind[] =
      mission.required_checks ?? mission.policy_snapshot?.requiredChecks ?? [];

    if (!requiredChecks.length) {
      return this.noOp('No required checks defined for mission');
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

    const observedChanges = [];
    const proposedActions: ProposedAction[] = [];

    // -------------------------------------------------------------------------
    // Status machine: implementing → awaiting_approval
    // -------------------------------------------------------------------------
    const currentStatus = mission.status as MissionStatus;
    let nextStatus: MissionStatus | null = null;

    if (currentStatus === 'implementing') {
      if (allPass) {
        // All checks pass — run the proof gate before advancing
        const evidence: ProofEvidence = {
          filesChanged: mission.manifest_version_id
            ? [`manifest@${mission.manifest_version_id}`]
            : [`mission:${missionId}`],
          behaviorChanged:
            `Mission ${missionId} evidence complete — all ${requiredChecks.length} required checks pass.`,
          checksRun: passing,
          failures: failing,
          securityImpact: mission.policy_snapshot?.securityImpact ?? 'none',
          deploymentImpact: mission.policy_snapshot?.deploymentImpact ?? 'none',
          rollbackPath:
            mission.policy_snapshot?.rollbackPath ??
            `Revert mission ${missionId} to status 'implementing' and re-run checks.`,
          unresolvedRisks: mission.policy_snapshot?.unresolvedRisks ?? [],
        };

        // Note: approvedBy is intentionally absent here.
        // This is the pre-approval gate — it verifies evidence quality, NOT founder sign-off.
        // Founder sign-off arrives separately via the approval engine on the
        // 'awaiting_approval' → 'deploying' transition (an APPROVAL_GATE).
        const gateResult = runProofGate('evidence-complete', evidence);

        this.log('info', 'Proof gate evaluated', {
          missionId,
          gateStatus: gateResult.status,
          failures: gateResult.evidence.failures,
        });

        if (gateResult.status === 'pass') {
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
            payload: {
              evidenceSummary: Object.fromEntries(latestByKind),
              proofGate: {
                status: gateResult.status,
                timestamp: gateResult.timestamp,
              },
            },
          });
        } else {
          // Gate failed — surface failures without advancing status
          proposedActions.push({
            actionType: 'proof_gate_failed',
            resourceType: 'mission',
            resourceId: missionId,
            requiresApproval: false,
            idempotencyKey: this.idempotencyKey(
              projectId,
              missionId,
              'proof_gate_failed',
              gateResult.timestamp,
            ),
            payload: {
              failures: gateResult.evidence.failures,
              timestamp: gateResult.timestamp,
            },
          });
        }
      } else if (failing.length > 0) {
        proposedActions.push({
          actionType: 'flag_failing_checks',
          resourceType: 'mission',
          resourceId: missionId,
          requiresApproval: false,
          idempotencyKey: this.idempotencyKey(
            projectId,
            missionId,
            'flag_failing',
            failing.join(','),
          ),
          payload: { failing },
        });
      }
    }

    // -------------------------------------------------------------------------
    // Apply status transition (optimistic concurrency)
    // -------------------------------------------------------------------------
    if (nextStatus && nextStatus !== currentStatus) {
      const { error: updateError } = await supabase
        .from('missions')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', missionId)
        .eq('status', currentStatus);

      if (updateError) {
        return this.noOp(`Status transition failed: ${updateError.message}`, 'retry');
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

  private noOp(
    message: string,
    status: ReconcileResult['status'] = 'converged',
  ): ReconcileResult {
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
