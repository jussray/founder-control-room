/**
 * ProofGateController
 *
 * A dedicated controller for explicit proof-gate runs on a mission.
 * Invoked by the approval engine when a founder-triggered gate check
 * is needed (e.g. before the 'deploying' transition).
 *
 * Unlike MissionController (which runs the gate implicitly as part of
 * reconciliation), this controller:
 *   - Accepts an approvedBy reference in req.meta for APPROVAL_GATES
 *   - Persists the gate result to the 'proof_gate_results' table
 *   - Returns 'blocked' if the gate fails so the caller can halt
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import { runProofGate, assertProofPassed, ProofGateError } from '../proof-gate/gate.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';
import type { ProofEvidence } from '../proof-gate/types.js';

export class ProofGateController extends BaseController {
  readonly name = 'ProofGateController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId: missionId } = req;

    // req.meta carries the gate context assembled by the approval engine
    const meta = req.meta as {
      gateId: string;
      evidence: ProofEvidence;
      approvedBy?: string;
    } | undefined;

    if (!missionId || !meta?.gateId || !meta?.evidence) {
      return this.noOp('Missing missionId, gateId, or evidence in request meta', 'retry');
    }

    this.log('info', 'Running proof gate', {
      missionId,
      gateId: meta.gateId,
      approvedBy: meta.approvedBy ?? '(none)',
    });

    const gateResult = runProofGate(meta.gateId, meta.evidence, meta.approvedBy);

    // Persist result — fail silently so a DB error doesn't halt the gate
    await supabase
      .from('proof_gate_results')
      .insert({
        mission_id: missionId,
        project_id: projectId,
        gate_id: gateResult.gateId,
        status: gateResult.status,
        evidence: gateResult.evidence,
        approved_by: gateResult.approvedBy ?? null,
        ran_at: gateResult.timestamp,
      })
      .then(({ error }) => {
        if (error) {
          this.log('warn', 'Failed to persist proof gate result', { error: error.message });
        }
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
            payload: { gateId: meta.gateId, timestamp: gateResult.timestamp },
          },
        ],
        evidenceIds: [],
        requiresApproval: false,
      };
    }

    // Gate failed — surface failures and block
    this.log('warn', 'Proof gate failed', {
      missionId,
      gateId: meta.gateId,
      failures: gateResult.evidence.failures,
    });

    let assertError: ProofGateError | null = null;
    try {
      assertProofPassed(gateResult);
    } catch (err) {
      if (err instanceof ProofGateError) assertError = err;
    }

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
            failures: gateResult.evidence.failures,
            message: assertError?.message ?? 'Proof gate failed',
          },
        },
      ],
      evidenceIds: [],
      requiresApproval: false,
      message: assertError?.message ?? 'Proof gate failed',
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
