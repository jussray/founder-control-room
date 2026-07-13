/**
 * ProofGateController
 *
 * Dedicated controller for explicit proof-gate runs on a mission.
 * Invoked by the approval engine when a founder-triggered gate check
 * is needed before a gated transition.
 *
 * Unlike MissionController, this controller:
 *   - accepts gateId / evidence / approvedBy via req.meta;
 *   - persists every result before reporting success;
 *   - blocks or retries when persistence fails;
 *   - returns the same canonical failure message used by ProofGateError.
 *
 * Expected proof_gate_results columns after the reconciliation migration:
 *   id, mission_id, project_id, gate_id, status, all_failures,
 *   evidence, approved_by, ran_at, created_at
 */

import { BaseController } from './base.js';
import { formatProofGateFailure, runProofGate } from '../proof-gate/gate.js';
import { persistProofResult } from '../proof-gate/persist.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';
import type { ProofEvidence } from '../proof-gate/types.js';

export class ProofGateController extends BaseController {
  readonly name = 'ProofGateController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId: missionId } = req;

    const meta = req.meta as {
      gateId: string;
      evidence: ProofEvidence;
      approvedBy?: string;
    } | undefined;

    if (!missionId || !meta?.gateId || !meta?.evidence) {
      return this.noOp('Missing missionId, gateId, or evidence in request meta', 'retry');
    }

    if (!projectId) {
      return this.noOp('Missing projectId — required for proof_gate_results insert', 'retry');
    }

    this.log('info', 'Running proof gate', {
      missionId,
      gateId: meta.gateId,
      approvedBy: meta.approvedBy ?? '(none)',
    });

    const gateResult = runProofGate(meta.gateId, meta.evidence, meta.approvedBy);

    let resultId: string;
    try {
      resultId = await persistProofResult(missionId, projectId, gateResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log('error', 'Failed to persist proof gate result — blocking', {
        error: message,
        missionId,
        gateId: meta.gateId,
      });
      return this.noOp(`Proof gate persistence failed: ${message}`, 'retry');
    }

    this.log('info', 'Proof gate result persisted', {
      resultId,
      status: gateResult.status,
    });

    if (gateResult.status === 'pass') {
      this.log('info', 'Proof gate passed', { missionId, gateId: meta.gateId });
      return {
        status: 'converged',
        observedChanges: [],
        proposedActions: [
          {
            actionType: 'proof_gate_passed',
            resourceType: 'mission',
            resourceId: missionId,
            requiresApproval: false,
            idempotencyKey: `${projectId}:${missionId}:proof_gate_passed:${gateResult.timestamp}`,
            payload: {
              gateId: meta.gateId,
              timestamp: gateResult.timestamp,
              resultId,
              attestationType: 'manual',
            },
          },
        ],
        evidenceIds: [],
        requiresApproval: false,
      };
    }

    const failureMessage = formatProofGateFailure(gateResult);
    this.log('warn', 'Proof gate failed', {
      missionId,
      gateId: meta.gateId,
      failures: gateResult.allFailures,
    });

    return {
      status: 'blocked',
      observedChanges: [],
      proposedActions: [
        {
          actionType: 'proof_gate_failed',
          resourceType: 'mission',
          resourceId: missionId,
          requiresApproval: false,
          idempotencyKey: `${projectId}:${missionId}:proof_gate_failed:${gateResult.timestamp}`,
          payload: {
            gateId: meta.gateId,
            failures: gateResult.allFailures,
            resultId,
            message: failureMessage,
          },
        },
      ],
      evidenceIds: [],
      requiresApproval: false,
      message: failureMessage,
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
