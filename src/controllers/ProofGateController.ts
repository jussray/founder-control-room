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
 *
 * Column alignment with the deployed schema
 * (20260711_proof_gate_results.sql + reconcile migration):
 *   id, mission_id, project_id, gate_id, status, all_failures,
 *   evidence, approved_by, ran_at, created_at
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import { runProofGate, assertProofPassed, ProofGateError } from '../proof-gate/gate.js';
import { persistProofResult } from '../proof-gate/persist.js';
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

    if (!projectId) {
      return this.noOp('Missing projectId — required for proof_gate_results insert', 'retry');
    }

    this.log('info', 'Running proof gate', {
      missionId,
      gateId: meta.gateId,
      approvedBy: meta.approvedBy ?? '(none)',
    });

    const gateResult = runProofGate(meta.gateId, meta.evidence, meta.approvedBy);

    // Persist result — projectId required by deployed schema (NOT NULL).
    // A persistence failure is a hard error, not a silent warning:
    // we must not allow a gate to appear to pass without a DB record.
    let resultId: string | null = null;
    try {
      resultId = await persistProofResult(missionId, projectId, gateResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('error', 'Failed to persist proof gate result — blocking', { error: msg });
      return this.noOp(`Proof gate persistence failed: ${msg}`, 'retry');
    }

    this.log('info', 'Proof gate result persisted', { resultId, status: gateResult.status });

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
            payload: { gateId: meta.gateId, timestamp: gateResult.timestamp, resultId },
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
      failures: gateResult.allFailures,
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
            failures: gateResult.allFailures,
            resultId,
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
