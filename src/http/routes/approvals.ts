/**
 * Approvals route — founder-gated action execution.
 *
 * Proof-gated actions require BOTH:
 *   1. a fresh founder-approved proof_gate_results record; and
 *   2. complete machine evidence bound to the exact current head SHA.
 *
 * Every external mutation is reserved in approval_executions BEFORE the
 * provider call. A pending reservation blocks replay if the provider succeeds
 * but the final audit update is interrupted.
 */

import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { supabase } from '../../lib/supabaseClient.js';
import { GitHubProvider } from '../../providers/GitHubProvider.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { ProofGateController } from '../../controllers/ProofGateController.js';
import type { ProofEvidence } from '../../proof-gate/index.js';
import type { EvidenceKind } from '../../reconciliation/types.js';
import type { PatchFileChange } from '../../providers/RepositoryProvider.js';

/** Mission states in which the branch is still under active work — safe to patch. */
const PATCHABLE_MISSION_STATUSES = new Set(['sandboxed', 'in_review']);

/** Rejects absolute paths and `..` segments before they reach the provider. */
function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\0')) return false;
  return !path.split('/').some((segment) => segment === '..' || segment === '');
}

const PROOF_GATED_ACTIONS = new Set(['merge', 'create_branch']);
const PROOF_GATE_TTL_MS = 15 * 60 * 1_000;

interface ExecutionRecord {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  result: Record<string, unknown> | null;
  success: boolean | null;
}

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

async function requireFreshProof(missionId: string, actionType: string) {
  const proofCutoff = new Date(Date.now() - PROOF_GATE_TTL_MS).toISOString();
  return supabase
    .from('proof_gate_results')
    .select('id, status, created_at, gate_id')
    .eq('mission_id', missionId)
    .eq('gate_id', actionType)
    .eq('status', 'pass')
    .gte('created_at', proofCutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function findExecution(idempotencyKey: string): Promise<{
  data: ExecutionRecord | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase
    .from('approval_executions')
    .select('id, status, result, success')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return { data: data as ExecutionRecord | null, error };
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
      .select('id, project_id, status, branch_ref, policy_snapshot')
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
      // Nothing in this codebase ever wrote policy_snapshot.expectedHeadSha,
      // which the merge-execution route (below) unconditionally requires to
      // match before it will merge anything — meaning no mission could ever
      // actually reach a completable merge, regardless of proof-gate result.
      // This is the natural point to pin it: the founder is approving merge
      // of the branch's CURRENT exact commit, resolved fresh right now, not
      // whatever it drifts to later (the execute route separately re-checks
      // this hasn't moved since).
      let expectedHeadSha: string | null = null;
      if (mission.branch_ref) {
        const { data: project } = await supabase
          .from('projects')
          .select('slug, repo_provider, repo_identifier')
          .eq('id', mission.project_id as string)
          .maybeSingle();

        const token = process.env['GITHUB_TOKEN'];
        if (project?.repo_identifier && token && project.repo_provider === 'github') {
          const provider = new GitHubProvider({
            token,
            projectMap: { [project.slug]: project.repo_identifier },
            baseUrl: process.env['GITHUB_API_BASE_URL'],
          });
          try {
            expectedHeadSha = await provider.resolveRef(project.slug, mission.branch_ref);
          } catch (err) {
            return res.status(502).json({
              ok: false,
              error: 'Proof passed but the branch head could not be resolved — approval not persisted.',
              detail: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      const { error: updateError } = await supabase
        .from('missions')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
          ...(expectedHeadSha
            ? { policy_snapshot: { ...(mission.policy_snapshot as Record<string, unknown> ?? {}), expectedHeadSha } }
            : {}),
        })
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

    if (!PROOF_GATED_ACTIONS.has(actionType)) {
      return res.status(400).json({ error: `Unknown actionType: ${actionType}` });
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

    const { data: proofRecord, error: proofError } = await requireFreshProof(missionId, actionType);
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

    const existingLookup = await findExecution(idempotencyKey);
    if (existingLookup.error) {
      return res.status(500).json({
        error: 'Unable to inspect the action idempotency ledger.',
        detail: existingLookup.error.message,
      });
    }
    if (existingLookup.data) {
      if (existingLookup.data.status === 'succeeded') {
        return res.json({ ok: true, idempotent: true, result: existingLookup.data.result });
      }
      if (existingLookup.data.status === 'pending') {
        return res.status(409).json({
          ok: false,
          code: 'ACTION_ALREADY_PENDING',
          error: 'This approved action is already reserved or may have executed. Reconcile it before retrying.',
          executionId: existingLookup.data.id,
        });
      }
      return res.status(409).json({
        ok: false,
        code: 'ACTION_PREVIOUSLY_FAILED',
        error: 'This idempotency key is bound to a prior failed action. Use a new approval and key after review.',
        result: existingLookup.data.result,
      });
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
          baseUrl: process.env['GITHUB_API_BASE_URL'],
        })
      : null;

    if (!provider) {
      return res.status(503).json({
        error: 'Repository provider is not configured.',
        code: 'REPOSITORY_PROVIDER_UNAVAILABLE',
      });
    }

    // Reserve before external mutation. The unique idempotency key is the final
    // race barrier if two requests pass the preceding lookup concurrently.
    const { data: reservation, error: reservationError } = await supabase
      .from('approval_executions')
      .insert({
        mission_id: missionId,
        project_id: projectId,
        action_type: actionType,
        idempotency_key: idempotencyKey,
        executed_by: req.founder!.email,
        status: 'pending',
        request: payload,
        result: {},
        success: null,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (reservationError || !reservation) {
      const racedLookup = await findExecution(idempotencyKey);
      if (racedLookup.data?.status === 'succeeded') {
        return res.json({ ok: true, idempotent: true, result: racedLookup.data.result });
      }
      if (racedLookup.data) {
        return res.status(409).json({
          ok: false,
          code: 'ACTION_ALREADY_RESERVED',
          error: 'Another request reserved this action. Reconcile that execution before retrying.',
          executionId: racedLookup.data.id,
        });
      }
      return res.status(500).json({
        error: 'Unable to reserve the approved action; no provider mutation was attempted.',
        code: 'ACTION_RESERVATION_FAILED',
        detail: reservationError?.message ?? 'Reservation insert returned no record.',
      });
    }

    let executionResult: Record<string, unknown> = {};
    let executionError: string | null = null;
    const warnings: string[] = [];

    try {
      if (actionType === 'create_branch') {
        if (mission.status !== 'proposed') {
          throw new Error(`Mission must be proposed before branch creation; current status is ${mission.status}.`);
        }
        const branchName = (payload['branchName'] as string) ?? `mission/${missionId.slice(0, 8)}`;
        const baseRef = (payload['baseRef'] as string) ?? 'main';
        await provider.createBranch(project.slug, baseRef, branchName);
        executionResult = { branchName, baseRef };

        const { error: missionUpdateError } = await supabase
          .from('missions')
          .update({
            branch_ref: branchName,
            status: 'sandboxed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', missionId)
          .eq('status', 'proposed');
        if (missionUpdateError) {
          warnings.push(`Branch was created, but mission state update failed: ${missionUpdateError.message}`);
        }
      } else {
        if (mission.status !== 'approved') {
          throw new Error(`Mission must be approved before merge; current status is ${mission.status}.`);
        }

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

        const { error: missionUpdateError } = await supabase
          .from('missions')
          .update({ status: 'integrated', updated_at: new Date().toISOString() })
          .eq('id', missionId)
          .eq('status', 'approved');
        if (missionUpdateError) {
          warnings.push(`Merge succeeded, but mission state update failed: ${missionUpdateError.message}`);
        }
      }
    } catch (error) {
      executionError = error instanceof Error ? error.message : String(error);
    }

    if (warnings.length) executionResult.warnings = warnings;

    const finalResult = executionError ? { error: executionError } : executionResult;
    const { error: auditUpdateError } = await supabase
      .from('approval_executions')
      .update({
        status: executionError ? 'failed' : 'succeeded',
        result: finalResult,
        success: !executionError,
        executed_at: new Date().toISOString(),
      })
      .eq('id', reservation.id)
      .eq('status', 'pending');

    if (auditUpdateError) {
      return res.status(500).json({
        ok: false,
        code: 'ACTION_AUDIT_INCOMPLETE',
        error: 'The provider action finished, but the execution ledger could not be finalized. Do not retry automatically.',
        executionId: reservation.id,
        providerOutcome: finalResult,
        detail: auditUpdateError.message,
      });
    }

    if (executionError) {
      return res.status(409).json({ ok: false, error: executionError, executionId: reservation.id });
    }

    await enqueueReconcile({
      projectId,
      controller: 'MissionController',
      resourceId: missionId,
      reason: 'dependency_changed',
    });

    return res.json({ ok: true, result: executionResult, executionId: reservation.id });
  },
);

/**
 * POST /:missionId/patch
 *
 * Founder-gated read/write/edit action: commits file changes onto a
 * mission's OWN sandbox branch — never onto the project's base ref.
 *
 * This is deliberately unguarded by the proof-gate — it edits a branch
 * nobody has approved yet, which is what sandboxes are for. The proof-gate
 * and exact-head verification in `/:missionId/execute` remain the only path
 * that can move code onto `base_ref`, so this route cannot be used to
 * bypass approval; it only changes what a pending approval will see.
 */
approvalsRouter.post(
  '/:missionId/patch',
  async (req: FounderRequest, res: Response) => {
    const { missionId } = req.params as { missionId: string };
    const { message, changes } = req.body as { message?: unknown; changes?: unknown };

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes must be a non-empty array' });
    }

    for (const change of changes as Array<Record<string, unknown>>) {
      if (typeof change?.['path'] !== 'string' || !isSafeRepoPath(change['path'] as string)) {
        return res.status(400).json({ error: `Invalid or unsafe path: ${JSON.stringify(change?.['path'])}` });
      }
      if (change['delete'] !== true && typeof change['content'] !== 'string') {
        return res.status(400).json({
          error: `changes for "${change['path'] as string}" must include string content unless delete is true`,
        });
      }
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (!PATCHABLE_MISSION_STATUSES.has(mission.status)) {
      return res.status(409).json({
        error: `Mission must be sandboxed or in_review to accept edits; current status is ${mission.status}.`,
        code: 'MISSION_NOT_EDITABLE',
      });
    }
    if (!mission.branch_ref) {
      return res.status(409).json({
        error: 'Mission has no branch yet. Call POST /:missionId/execute with actionType "create_branch" first.',
        code: 'MISSION_HAS_NO_BRANCH',
      });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, repo_provider, repo_identifier')
      .eq('id', mission.project_id as string)
      .single();

    if (projectError || !project) {
      return res.status(500).json({ error: 'Project repository configuration not found.' });
    }

    const token = process.env['GITHUB_TOKEN'];
    const provider = token && project.repo_provider === 'github' && project.repo_identifier
      ? new GitHubProvider({
          token,
          projectMap: { [project.slug]: project.repo_identifier },
          baseUrl: process.env['GITHUB_API_BASE_URL'],
        })
      : null;

    if (!provider) {
      return res.status(503).json({
        error: 'Repository provider is not configured.',
        code: 'REPOSITORY_PROVIDER_UNAVAILABLE',
      });
    }

    let commitSha: string;
    try {
      commitSha = await provider.commitPatch(project.slug, mission.branch_ref, {
        message,
        changes: changes as PatchFileChange[],
        authorName: 'founder-control-room',
      });
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Patch commit failed',
        code: 'PATCH_COMMIT_FAILED',
      });
    }

    await supabase.from('project_events').insert({
      project_id: project.id,
      source_event_id: randomUUID(),
      event_type: 'mission_patch_committed',
      severity: 'info',
      screen: 'control-room-api',
      metadata: {
        route: `POST /approvals/${missionId}/patch`,
        committed_by: req.founder!.email,
        branch: mission.branch_ref,
        commitSha,
        filesChanged: (changes as Array<Record<string, unknown>>).map((c) => c['path']),
      },
    });

    return res.status(201).json({ ok: true, commitSha, branch: mission.branch_ref });
  },
);
