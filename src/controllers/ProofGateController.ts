/**
 * ProofGateController
 *
 * Dedicated controller for explicit proof-gate runs on a mission.
 * Invoked by the approval engine when a founder-triggered gate check
 * is needed (e.g. before the 'deploying' transition).
 *
 * Unlike MissionController (which runs the gate implicitly as part of
 * reconciliation), this controller:
 *   - Accepts gateId / evidence / approvedBy via req.meta
 *   - Persists the gate result to proof_gate_results — MANDATORY.
 *     If persistence fails, the gate returns 'blocked'. It never
 *     silently passes when there is no audit record.
 *   - Returns 'blocked' if the gate fails so the caller can halt.
 *
 * Live proof_gate_results columns (as of 2026-07-11):
 *   id, mission_id, project_id, gate_id, status, evidence, approved_by, ran_at, created_at
 *
 * Note: all_failures is NOT a live column. Gate failure detail lives inside
 * the evidence JSONB payload. Do not write it as a top-level column until
 * the reconcile migration (PR #6) lands and is deployed.
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

    // Persistence is MANDATORY. A failed insert blocks the gate.
    // We must never return a passing response without a durable record.
    const { error: insertError } = await supabase
      .from('proof_gate_results')
      .insert({
        mission_id: missionId,
        project_id: projectId,
        gate_id: gateResult.gateId,
        status: gateResult.status,
        evidence: gateResult.evidence,
        approved_by: gateResult.approvedBy ?? null,
      });

    if (insertError) {
      this.log('error', 'Failed to persist proof gate result — blocking', {
        error: insertError.message,
        missionId,
        gateId: meta.gateId,
      });
      return this.noOp(
        `Proof gate result could not be persisted: ${insertError.message}`,
        'blocked',
      );
    }

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
              attestationType: 'manual',
            },
          },
        ],
        evidenceIds: [],
        requiresApproval: false,
      };
    }

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
            timestamp: gateResult.timestamp,
          },
        },
      ],
      evidenceIds: [],
      requiresApproval: false,
      message: assertError?.message ?? `Proof gate failed: ${gateResult.allFailures.join('; ')}`,
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
