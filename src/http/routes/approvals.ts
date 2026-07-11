/**
 * Approvals route — founder-gated action execution.
 *
 * POST /approvals/:missionId/run-proof-gate
 *   Body: { gateId, evidence: ProofEvidence }
 *   Runs a proof gate check against the mission and persists the result.
 *   approvedBy is set automatically from the authenticated founder JWT.
 *   Persistence failure returns 500 — never silently passes.
 *
 * POST /approvals/:missionId/execute
 *   Body: { actionType, idempotencyKey, payload? }
 *   For merge and create_branch: requires a passing, non-expired
 *   proof_gate_results record before execution proceeds.
 *
 * Supported actionTypes in Milestone B:
 *   - create_branch  (proof gate required)
 *   - merge          (proof gate required)
 *
 * Explicitly NOT supported:
 *   - deploy  (returns 501 — no provider adapter yet)
 */

import { Router } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import type { FounderRequest } from '../middleware/requireFounder.js';
import { supabase } from '../../lib/supabaseClient.js';
import { GitHubProvider } from '../../providers/GitHubProvider.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { ProofGateController } from '../../controllers/ProofGateController.js';
import type { ProofEvidence } from '../../proof-gate/index.js';
import type { Response } from 'express';

/** Actions that must have a passing proof_gate_results record before execution. */
const PROOF_GATED_ACTIONS = new Set(['merge', 'create_branch']);

/** Gate results expire after 15 minutes. */
const PROOF_GATE_TTL_MS = 15 * 60 * 1_000;

export const approvalsRouter = Router();

approvalsRouter.use(requireFounder);

// ---------------------------------------------------------------------------
// Runtime evidence validation
// ---------------------------------------------------------------------------

function validateEvidence(body: unknown): { ok: true; evidence: ProofEvidence } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'evidence must be an object' };
  }
  const e = body as Record<string, unknown>;

  const strArrayFields = ['filesChanged', 'checksRun', 'failures', 'unresolvedRisks'] as const;
  for (const field of strArrayFields) {
    if (!Array.isArray(e[field]) || !( e[field] as unknown[]).every((v) => typeof v === 'string')) {
      return { ok: false, error: `evidence.${field} must be a string array` };
    }
  }

  const strFields = ['behaviorChanged', 'securityImpact', 'deploymentImpact', 'rollbackPath'] as const;
  for (const field of strFields) {
    if (typeof e[field] !== 'string' || (e[field] as string).trim() === '') {
      return { ok: false, error: `evidence.${field} must be a non-empty string` };
    }
  }

  return { ok: true, evidence: e as unknown as ProofEvidence };
}

// ---------------------------------------------------------------------------
// POST /approvals/:missionId/run-proof-gate
// ---------------------------------------------------------------------------

approvalsRouter.post(
  '/:missionId/run-proof-gate',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const body = req.body as Record<string, unknown>;
    const gateId = body['gateId'];

    if (typeof gateId !== 'string' || gateId.trim() === '') {
      return res.status(400).json({ error: '`gateId` must be a non-empty string' });
    }

    const evidenceValidation = validateEvidence(body['evidence']);
    if (!evidenceValidation.ok) {
      return res.status(400).json({ error: evidenceValidation.error });
    }

    const { data: mission, error: missionErr } = await supabase
      .from('missions')
      .select('id, project_id')
      .eq('id', missionId)
      .single();

    if (missionErr || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const controller = new ProofGateController();
    const result = await controller.run({
      projectId: mission.project_id as string,
      controller: 'ProofGateController',
      resourceId: missionId,
      reason: 'founder_triggered',
      meta: {
        gateId,
        evidence: evidenceValidation.evidence,
        // approvedBy sourced from verified JWT — not caller-supplied.
        approvedBy: req.founder!.email,
      },
    });

    if (result.status === 'blocked' && result.message?.includes('could not be persisted')) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to persist proof gate result — gate cannot authorize execution',
        detail: result.message,
      });
    }

    const status = result.status === 'converged' ? 200 : 422;
    return res.status(status).json({
      ok: result.status === 'converged',
      gateStatus: result.status,
      attestationType: 'manual',
      actions: result.proposedActions,
      message: result.message,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /approvals/:missionId/execute
// ---------------------------------------------------------------------------

approvalsRouter.post(
  '/:missionId/execute',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const { actionType, idempotencyKey, payload = {} } = req.body as {
      actionType: string;
      idempotencyKey: string;
      payload?: Record<string, unknown>;
    };

    if (!actionType || !idempotencyKey) {
      return res.status(400).json({ error: 'actionType and idempotencyKey are required' });
    }

    if (actionType === 'deploy') {
      return res.status(501).json({
        error: 'Deployment execution is not implemented',
        code: 'DEPLOYMENT_NOT_SUPPORTED',
      });
    }

    const { data: mission, error: missionErr } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_name, policy_snapshot')
      .eq('id', missionId)
      .single();

    if (missionErr || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const projectId = mission.project_id as string;

    // -------------------------------------------------------------------------
    // Proof gate enforcement — required for merge and create_branch.
    // Must have a passing, non-expired proof_gate_results record.
    // A gate beside the door is decorative architecture.
    // -------------------------------------------------------------------------
    if (PROOF_GATED_ACTIONS.has(actionType)) {
      const proofCutoff = new Date(Date.now() - PROOF_GATE_TTL_MS).toISOString();
      const { data: proofRecord, error: proofErr } = await supabase
        .from('proof_gate_results')
        .select('id, status, created_at, gate_id')
        .eq('mission_id', missionId)
        .eq('gate_id', actionType)
        .eq('status', 'pass')
        .gte('created_at', proofCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (proofErr) {
        return res.status(500).json({
          error: 'Failed to verify proof gate — cannot proceed',
          detail: proofErr.message,
        });
      }

      if (!proofRecord) {
        return res.status(403).json({
          error: `Action '${actionType}' requires a passing proof gate result (gate_id: '${actionType}') within the last 15 minutes.`,
          code: 'PROOF_GATE_REQUIRED',
          hint: `Call POST /approvals/${missionId}/run-proof-gate with gateId: "${actionType}" first.`,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Idempotency check
    // -------------------------------------------------------------------------
    const { data: existing } = await supabase
      .from('approval_executions')
      .select('id, result')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return res.json({ ok: true, idempotent: true, result: existing.result });
    }

    const { data: connection } = await supabase
      .from('project_connections')
      .select('connection_config')
      .eq('project_id', projectId)
      .eq('provider', 'github')
      .eq('status', 'active')
      .single();

    const config = connection?.connection_config as Record<string, unknown> | undefined;
    const repoFullName = config?.['repository'] as string | undefined;
    const token = process.env['GITHUB_TOKEN'];

    const provider = token && repoFullName
      ? new GitHubProvider({ token, projectMap: { [projectId]: repoFullName } })
      : null;

    let result: Record<string, unknown> = {};
    let executionError: string | null = null;

    try {
      switch (actionType) {
        case 'create_branch': {
          if (!provider) throw new Error('GitHub provider not configured');
          const branchName = (payload['branchName'] as string) ?? `mission/${missionId.slice(0, 8)}`;
          const baseRef = (payload['baseRef'] as string) ?? 'main';
          await provider.createBranch(projectId, baseRef, branchName);
          await supabase
            .from('missions')
            .update({ branch_name: branchName, updated_at: new Date().toISOString() })
            .eq('id', missionId);
          result = { branchName, baseRef };
          break;
        }

        case 'merge': {
          if (!provider) throw new Error('GitHub provider not configured');
          const head = (payload['head'] as string) ?? mission.branch_name;
          const base = (payload['base'] as string) ?? 'main';
          if (!head) throw new Error('No head branch to merge');
          const mergeCommitSha = await provider.integrate(projectId, base, head);
          result = { mergeCommitSha, head, base };
          await supabase
            .from('missions')
            .update({ status: 'verifying', updated_at: new Date().toISOString() })
            .eq('id', missionId)
            .eq('status', 'awaiting_approval');
          break;
        }

        default:
          return res.status(400).json({ error: `Unknown actionType: ${actionType}` });
      }
    } catch (err) {
      executionError = err instanceof Error ? err.message : String(err);
    }

    await supabase.from('approval_executions').insert({
      mission_id: missionId,
      project_id: projectId,
      action_type: actionType,
      idempotency_key: idempotencyKey,
      executed_by: req.founder!.email,
      result: executionError ? { error: executionError } : result,
      success: !executionError,
      executed_at: new Date().toISOString(),
    });

    if (executionError) {
      return res.status(500).json({ ok: false, error: executionError });
    }

    await enqueueReconcile({
      projectId,
      controller: 'MissionController',
      resourceId: missionId,
      reason: 'dependency_changed',
    });

    return res.json({ ok: true, result });
  },
);
