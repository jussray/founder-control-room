/**
 * Approvals route — founder-gated action execution.
 *
 * Proof-gated actions require BOTH:
 *   1. a fresh founder-approved proof_gate_results record; and
 *   2. complete machine evidence bound to the exact current head SHA.
 *
 * Supported actionTypes:
 *   - create_branch
 *   - merge
 *
 * Deployment remains unsupported here and requires its own adapter + approval.
 */

import { Router } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import type { FounderRequest } from '../middleware/requireFounder.js';
import { supabase } from '../../lib/supabaseClient.js';
import { GitHubProvider } from '../../providers/GitHubProvider.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { ProofGateController } from '../../controllers/ProofGateController.js';
import type { ProofEvidence } from '../../proof-gate/index.js';
import type { EvidenceKind } from '../../reconciliation/types.js';
import type { Response } from 'express';

const PROOF_GATED_ACTIONS = new Set(['merge', 'create_branch']);
const PROOF_GATE_TTL_MS = 15 * 60 * 1_000;

export const approvalsRouter = Router();
approvalsRouter.use(requireFounder);

function validateEvidence(body: unknown): { ok: true; evidence: ProofEvidence } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'evidence must be an object' };
  }
  const evidence = body as Record<string, unknown>;

  const stringArrayFields = ['filesChanged', 'checksRun', 'failures', 'unresolvedRisks'] as const;
  for (const field of stringArrayFields) {
    if (!Array.isArray(evidence[field]) || !(evidence[field] as unknown[]).every((value) => typeof value === 'string')) {
      return { ok: false, error: `evidence.${field} must be a string array` };
    }
  }

  const stringFields = ['behaviorChanged', 'securityImpact', 'deploymentImpact', 'rollbackPath'] as const;
  for (const field of stringFields) {
    if (typeof evidence[field] !== 'string' || (evidence[field] as string).trim() === '') {
      return { ok: false, error: `evidence.${field} must be a non-empty string` };
    }
  }

  return { ok: true, evidence: evidence as unknown as ProofEvidence };
}

async function verifyExactHeadEvidence(
  missionId: string,
  requiredChecks: EvidenceKind[],
  expectedHeadSha: string,
): Promise<{ ok: true; summary: Record<string, string> } | { ok: false; error: string; details?: unknown }> {
  if (!requiredChecks.length) {
    return { ok: false, error: 'Mission has no required machine checks.' };
  }

  const { data: rows, error } = await supabase
    .from('evidence')
    .select('kind, status, commit_sha, created_at')
    .eq('mission_id', missionId)
    .in('kind', requiredChecks)
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, error: 'Unable to read machine evidence.', details: error.message };
  }

  const latest = new Map<string, { status: string; commitSha: string | null }>();
  for (const row of rows ?? []) {
    if (latest.has(row.kind)) continue;
    latest.set(row.kind, {
      status: row.status,
      commitSha: row.commit_sha ? String(row.commit_sha).toLowerCase() : null,
    });
  }

  const missing = requiredChecks.filter((kind) => !latest.has(kind));
  const failing = requiredChecks.filter((kind) => latest.get(kind)?.status !== 'pass');
  const wrongHead = requiredChecks.filter(
    (kind) => latest.get(kind)?.commitSha !== expectedHeadSha.toLowerCase(),
  );

  if (missing.length || failing.length || wrongHead.length) {
    return {
      ok: false,
      error: 'Exact-head machine evidence is incomplete.',
      details: { missing, failing, wrongHead, expectedHeadSha },
    };
  }

  return {
    ok: true,
    summary: Object.fromEntries(
      requiredChecks.map((kind) => [kind, `${latest.get(kind)!.status}@${latest.get(kind)!.commitSha}`]),
    ),
  };
}

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

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
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

    if (result.status === 'converged' && gateId === 'merge' && mission.status === 'in_review') {
      const { error: updateError } = await supabase
        .from('missions')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', missionId)
        .eq('status', 'in_review');

      if (updateError) {
        return res.status(500).json({
          ok: false,
          error: 'Proof passed but mission approval state could not be persisted.',
          detail: updateError.message,
        });
      }
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

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref, required_checks, policy_snapshot')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const projectId = mission.project_id as string;

    if (PROOF_GATED_ACTIONS.has(actionType)) {
      const proofCutoff = new Date(Date.now() - PROOF_GATE_TTL_MS).toISOString();
      const { data: proofRecord, error: proofError } = await supabase
        .from('proof_gate_results')
        .select('id, status, created_at, gate_id')
        .eq('mission_id', missionId)
        .eq('gate_id', actionType)
        .eq('status', 'pass')
        .gte('created_at', proofCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (proofError) {
        return res.status(500).json({
          error: 'Failed to verify proof gate — cannot proceed',
          detail: proofError.message,
        });
      }

      if (!proofRecord) {
        return res.status(403).json({
          error: `Action '${actionType}' requires a passing proof gate result within the last 15 minutes.`,
          code: 'PROOF_GATE_REQUIRED',
          hint: `Call POST /approvals/${missionId}/run-proof-gate with gateId: "${actionType}" first.`,
        });
      }
    }

    const { data: existing } = await supabase
      .from('approval_executions')
      .select('id, result')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return res.json({ ok: true, idempotent: true, result: existing.result });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, repo_provider, repo_identifier')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(500).json({ error: 'Project repository configuration not found.' });
    }

    const token = process.env['GITHUB_TOKEN'];
    const provider = token && project.repo_provider === 'github' && project.repo_identifier
      ? new GitHubProvider({
          token,
          projectMap: { [project.slug]: project.repo_identifier },
        })
      : null;

    let executionResult: Record<string, unknown> = {};
    let executionError: string | null = null;

    try {
      switch (actionType) {
        case 'create_branch': {
          if (mission.status !== 'proposed') {
            throw new Error(`Mission must be proposed before branch creation; current status is ${mission.status}.`);
          }
          if (!provider) throw new Error('Repository provider is not configured');
          const branchName = (payload['branchName'] as string) ?? `mission/${missionId.slice(0, 8)}`;
          const baseRef = (payload['baseRef'] as string) ?? 'main';
          await provider.createBranch(project.slug, baseRef, branchName);
          await supabase
            .from('missions')
            .update({
              branch_ref: branchName,
              status: 'sandboxed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', missionId)
            .eq('status', 'proposed');
          executionResult = { branchName, baseRef };
          break;
        }

        case 'merge': {
          if (mission.status !== 'approved') {
            throw new Error(`Mission must be approved before merge; current status is ${mission.status}.`);
          }
          if (!provider) throw new Error('Repository provider is not configured');

          const head = (payload['head'] as string) ?? mission.branch_ref;
          const base = (payload['base'] as string) ?? 'main';
          const expectedHeadSha = typeof payload['expectedHeadSha'] === 'string'
            ? payload['expectedHeadSha'].toLowerCase()
            : '';
          if (!head) throw new Error('No head branch to merge');
          if (!/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
            throw new Error('Merge requires expectedHeadSha as a full 40-character commit SHA.');
          }

          const missionExpectedHead = typeof mission.policy_snapshot?.expectedHeadSha === 'string'
            ? mission.policy_snapshot.expectedHeadSha.toLowerCase()
            : '';
          if (!missionExpectedHead || missionExpectedHead !== expectedHeadSha) {
            throw new Error('Merge SHA does not match the mission policy snapshot.');
          }

          const evidenceResult = await verifyExactHeadEvidence(
            missionId,
            (mission.required_checks ?? []) as EvidenceKind[],
            expectedHeadSha,
          );
          if (!evidenceResult.ok) {
            throw new Error(`${evidenceResult.error} ${JSON.stringify(evidenceResult.details ?? {})}`);
          }

          const currentHeadSha = await provider.resolveRef(project.slug, head);
          if (currentHeadSha !== expectedHeadSha) {
            throw new Error(
              `Branch moved after verification: current ${currentHeadSha}, approved ${expectedHeadSha}.`,
            );
          }

          const mergeCommitSha = await provider.integrate(project.slug, base, head);
          executionResult = {
            mergeCommitSha,
            head,
            base,
            expectedHeadSha,
            evidence: evidenceResult.summary,
          };
          await supabase
            .from('missions')
            .update({ status: 'integrated', updated_at: new Date().toISOString() })
            .eq('id', missionId)
            .eq('status', 'approved');
          break;
        }

        default:
          return res.status(400).json({ error: `Unknown actionType: ${actionType}` });
      }
    } catch (error) {
      executionError = error instanceof Error ? error.message : String(error);
    }

    await supabase.from('approval_executions').insert({
      mission_id: missionId,
      project_id: projectId,
      action_type: actionType,
      idempotency_key: idempotencyKey,
      executed_by: req.founder!.email,
      result: executionError ? { error: executionError } : executionResult,
      success: !executionError,
      executed_at: new Date().toISOString(),
    });

    if (executionError) {
      return res.status(409).json({ ok: false, error: executionError });
    }

    await enqueueReconcile({
      projectId,
      controller: 'MissionController',
      resourceId: missionId,
      reason: 'dependency_changed',
    });

    return res.json({ ok: true, result: executionResult });
  },
);
