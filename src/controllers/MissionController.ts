/**
 * MissionController
 *
 * Evaluates current evidence against the mission's required checks.
 * Advances a sandboxed mission to in_review only when exact-head evidence is
 * complete and the evidence-quality proof gate clears.
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
import { WEBHOOK_ONLY_EVIDENCE_KINDS } from '../reconciliation/types.js';
import type { ProofEvidence } from '../proof-gate/types.js';

type MissionStatus =
  | 'proposed'
  | 'sandboxed'
  | 'in_review'
  | 'approved'
  | 'integrated'
  | 'deployed'
  | 'rejected'
  | 'rolled_back';

interface LatestEvidence {
  status: string;
  commitSha: string | null;
  provider: string | null;
}

export class MissionController extends BaseController {
  readonly name = 'MissionController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId: missionId } = req;

    if (!missionId) return this.noOp('No missionId');

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, status, base_ref, required_checks, manifest_version_id, policy_snapshot, branch_ref')
      .eq('id', missionId)
      .eq('project_id', projectId)
      .single();

    if (missionError || !mission) {
      return this.noOp(`Mission ${missionId} not found`, 'retry');
    }

    const currentStatus = mission.status as MissionStatus;
    const observedChanges = [];
    const proposedActions: ProposedAction[] = [];

    // A mission branch is a separately approved L99 action.
    if (currentStatus === 'proposed' && !mission.branch_ref) {
      const branchName = `mission/${missionId.slice(0, 8)}`;
      proposedActions.push({
        actionType: 'create_branch',
        resourceType: 'mission',
        resourceId: missionId,
        requiresApproval: true,
        idempotencyKey: this.idempotencyKey(projectId, missionId, 'create_branch', 'initial'),
        payload: { branchName, baseRef: mission.base_ref ?? 'main' },
      });

      return {
        status: 'drifted',
        observedChanges: [],
        proposedActions,
        evidenceIds: [],
        requiresApproval: true,
        message: 'Branch not yet created — awaiting founder approval',
      };
    }

    const requiredChecks = (mission.required_checks ?? []) as EvidenceKind[];
    if (!requiredChecks.length) {
      return this.noOp('No required checks defined for mission');
    }

    const expectedHeadSha = typeof mission.policy_snapshot?.expectedHeadSha === 'string'
      ? mission.policy_snapshot.expectedHeadSha.toLowerCase()
      : null;

    const { data: evidenceRows } = await supabase
      .from('evidence')
      .select('kind, status, commit_sha, provider, created_at')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false });

    const latestByKind = new Map<string, LatestEvidence>();
    for (const row of evidenceRows ?? []) {
      if (latestByKind.has(row.kind)) continue;
      latestByKind.set(row.kind, {
        status: row.status,
        commitSha: row.commit_sha ? String(row.commit_sha).toLowerCase() : null,
        provider: row.provider ?? null,
      });
    }

    const missing = requiredChecks.filter((kind) => !latestByKind.has(kind));
    const wrongHead = expectedHeadSha
      ? requiredChecks.filter((kind) => {
          const evidence = latestByKind.get(kind);
          return evidence && evidence.commitSha !== expectedHeadSha;
        })
      : [];
    const wrongProvider = requiredChecks.filter((kind) => {
      if (!WEBHOOK_ONLY_EVIDENCE_KINDS.has(kind)) return false;
      const evidence = latestByKind.get(kind);
      return evidence !== undefined && evidence.provider !== 'github';
    });
    const failing = requiredChecks.filter((kind) => latestByKind.get(kind)?.status === 'fail');
    const passing = requiredChecks.filter((kind) => {
      const evidence = latestByKind.get(kind);
      if (!evidence) return false;
      if (evidence.status !== 'pass') return false;
      if (expectedHeadSha && evidence.commitSha !== expectedHeadSha) return false;
      if (WEBHOOK_ONLY_EVIDENCE_KINDS.has(kind) && evidence.provider !== 'github') return false;
      return true;
    });
    const allPass = passing.length === requiredChecks.length;

    this.log('info', 'Mission evidence evaluated', {
      missionId,
      expectedHeadSha,
      required: requiredChecks.length,
      passing: passing.length,
      failing: failing.length,
      missing: missing.length,
      wrongHead: wrongHead.length,
      wrongProvider: wrongProvider.length,
    });

    let nextStatus: MissionStatus | null = null;

    // sandboxed → in_review means machine evidence is complete. It does not
    // mean the founder approved merge.
    if (currentStatus === 'sandboxed') {
      if (allPass) {
        const evidence: ProofEvidence = {
          filesChanged: mission.manifest_version_id
            ? [`manifest@${mission.manifest_version_id}`]
            : [`mission:${missionId}`],
          behaviorChanged:
            `Mission ${missionId} exact-head evidence complete — all ${requiredChecks.length} required checks pass.`,
          checksRun: passing,
          failures: failing,
          securityImpact: mission.policy_snapshot?.securityImpact ?? 'none',
          deploymentImpact: mission.policy_snapshot?.deploymentImpact ?? 'none',
          rollbackPath:
            mission.policy_snapshot?.rollbackPath ??
            `Revert the integration commit and return mission ${missionId} to sandboxed.`,
          unresolvedRisks: mission.policy_snapshot?.unresolvedRisks ?? [],
        };

        const gateResult = runProofGate('evidence-complete', evidence);
        if (gateResult.status === 'pass') {
          nextStatus = 'in_review';
          proposedActions.push({
            actionType: 'request_approval',
            resourceType: 'mission',
            resourceId: missionId,
            requiresApproval: true,
            idempotencyKey: this.idempotencyKey(
              projectId,
              missionId,
              'request_approval',
              expectedHeadSha ?? gateResult.timestamp,
            ),
            payload: {
              expectedHeadSha,
              evidenceSummary: Object.fromEntries(
                [...latestByKind.entries()].map(([kind, value]) => [
                  kind,
                  { status: value.status, provider: value.provider },
                ]),
              ),
              proofGate: {
                status: gateResult.status,
                timestamp: gateResult.timestamp,
              },
            },
          });
        } else {
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
      } else if (failing.length > 0 || wrongHead.length > 0 || wrongProvider.length > 0) {
        proposedActions.push({
          actionType: 'flag_failing_checks',
          resourceType: 'mission',
          resourceId: missionId,
          requiresApproval: false,
          idempotencyKey: this.idempotencyKey(
            projectId,
            missionId,
            'flag_failing',
            [...failing, ...wrongHead, ...wrongProvider].join(','),
          ),
          payload: { failing, missing, wrongHead, wrongProvider, expectedHeadSha },
        });
      }
    }

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
    }

    return {
      status: allPass ? 'converged' : missing.length > 0 || wrongHead.length > 0 ? 'drifted' : 'blocked',
      observedChanges,
      proposedActions,
      evidenceIds: [],
      requiresApproval: proposedActions.some((action) => action.requiresApproval),
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
