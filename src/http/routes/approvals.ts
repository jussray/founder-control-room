/**
 * Approvals route — founder-gated action execution.
 *
 * POST /approvals/:missionId/execute
 *   Body: { actionType, idempotencyKey, payload? }
 *
 * Supported actionTypes in Milestone B:
 *   - create_branch
 *   - merge
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
import type { Response } from 'express';

export const approvalsRouter = Router();

approvalsRouter.use(requireFounder);

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
