/**
 * Approvals route — founder-gated action execution.
 *
 * POST /approvals/:missionId/execute
 *   Body: { idempotencyKey: string }
 *
 * The caller supplies ONLY the idempotency key. All action details
 * (type, payload, head SHA, base branch) are read from the persisted
 * proposed_actions row — never from the request body.
 *
 * Rejection criteria (any one causes 4xx):
 *   - proposed_action row not found
 *   - proposed_action.mission_id !== :missionId
 *   - proposed_action.status !== 'pending' (already claimed/executed/expired)
 *   - mission.status !== proposed_action.expected_mission_status
 *   - proposed_action.action_type === 'deploy' (not implemented — 501)
 *   - action_type not in ('create_branch', 'merge')
 *
 * On success:
 *   1. proposed_action.status is set to 'claimed' in the same DB call
 *      (optimistic UPDATE ... WHERE status = 'pending' — exactly-once)
 *   2. GitHub API is called
 *   3. approval_executions row is inserted (success or failure)
 *   4. proposed_action.status is set to 'executed' on success,
 *      back to 'pending' on failure so the founder can retry
 *   5. MissionController is re-enqueued
 *
 * Idempotency: if an approval_executions row exists for this key, the
 * previous result is returned immediately without re-executing.
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
    const { idempotencyKey } = req.body as { idempotencyKey?: string };

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'idempotencyKey is required' });
    }

    // -----------------------------------------------------------------------
    // 1. Idempotency check — return prior result without re-executing
    // -----------------------------------------------------------------------
    const { data: existing } = await supabase
      .from('approval_executions')
      .select('id, result, success')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return res.json({ ok: existing.success, idempotent: true, result: existing.result });
    }

    // -----------------------------------------------------------------------
    // 2. Load the proposed action — must exist and be pending
    // -----------------------------------------------------------------------
    const { data: proposal } = await supabase
      .from('proposed_actions')
      .select(
        'id, mission_id, project_id, action_type, idempotency_key, ' +
        'head_branch, base_branch, head_sha, branch_name, payload, ' +
        'evidence_snapshot, expected_mission_status, status',
      )
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (!proposal) {
      return res.status(404).json({ error: 'No proposed action found for this idempotency key' });
    }

    if (proposal.mission_id !== missionId) {
      return res.status(403).json({ error: 'idempotency key does not belong to this mission' });
    }

    if (proposal.status !== 'pending') {
      return res.status(409).json({
        error: `Proposed action is ${proposal.status} — cannot execute`,
        status: proposal.status,
      });
    }

    // -----------------------------------------------------------------------
    // 3. Deploy is explicitly not implemented
    // -----------------------------------------------------------------------
    if (proposal.action_type === 'deploy') {
      return res.status(501).json({
        error: 'Deployment execution is not implemented',
        code: 'DEPLOYMENT_NOT_SUPPORTED',
      });
    }

    if (!['create_branch', 'merge'].includes(proposal.action_type)) {
      return res.status(400).json({ error: `Unknown action type: ${proposal.action_type}` });
    }

    const projectId = proposal.project_id as string;

    // -----------------------------------------------------------------------
    // 4. Load and validate mission state
    // -----------------------------------------------------------------------
    const { data: mission, error: missionErr } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_name')
      .eq('id', missionId)
      .single();

    if (missionErr || !mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.project_id !== projectId) {
      return res.status(403).json({ error: 'Mission does not belong to this project' });
    }

    if (mission.status !== proposal.expected_mission_status) {
      return res.status(409).json({
        error: `Mission is in status '${mission.status}', expected '${proposal.expected_mission_status}'`,
        missionStatus: mission.status,
        expectedStatus: proposal.expected_mission_status,
      });
    }

    // -----------------------------------------------------------------------
    // 5. Claim the action transactionally (optimistic exactly-once)
    //    UPDATE WHERE status = 'pending' — if another request claimed it first,
    //    the count will be 0 and we return 409.
    // -----------------------------------------------------------------------
    const { count: claimCount, error: claimError } = await supabase
      .from('proposed_actions')
      .update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('id', proposal.id)
      .eq('status', 'pending')
      .select('id', { count: 'exact', head: true });

    if (claimError || claimCount === 0) {
      return res.status(409).json({ error: 'Action was already claimed by a concurrent request' });
    }

    // -----------------------------------------------------------------------
    // 6. Resolve GitHub provider
    // -----------------------------------------------------------------------
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

    const provider =
      token && repoFullName
        ? new GitHubProvider({ token, projectMap: { [projectId]: repoFullName } })
        : null;

    // -----------------------------------------------------------------------
    // 7. Execute — all action details come from the proposal, not the request
    // -----------------------------------------------------------------------
    let result: Record<string, unknown> = {};
    let executionError: string | null = null;

    try {
      switch (proposal.action_type) {
        case 'create_branch': {
          if (!provider) throw new Error('GitHub provider not configured');
          const branchName = proposal.branch_name ?? `mission/${missionId.slice(0, 8)}`;
          const baseRef = proposal.base_branch ?? 'main';
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
          const head = proposal.head_branch;
          const base = proposal.base_branch ?? 'main';
          if (!head) throw new Error('No head branch on proposed action');
          const mergeCommitSha = await provider.integrate(projectId, base, head);
          result = { mergeCommitSha, head, base };

          // Advance mission to deploying
          await supabase
            .from('missions')
            .update({ status: 'deploying', updated_at: new Date().toISOString() })
            .eq('id', missionId)
            .eq('status', 'awaiting_approval');

          break;
        }
      }
    } catch (err) {
      executionError = err instanceof Error ? err.message : String(err);
    }

    // -----------------------------------------------------------------------
    // 8. Audit — persist execution record regardless of success/failure
    // -----------------------------------------------------------------------
    await supabase.from('approval_executions').insert({
      proposed_action_id: proposal.id,
      mission_id: missionId,
      project_id: projectId,
      action_type: proposal.action_type,
      idempotency_key: idempotencyKey,
      executed_by: req.founder!.email,
      result: executionError ? { error: executionError } : result,
      success: !executionError,
      executed_at: new Date().toISOString(),
    });

    // Mark proposal executed (or unclaim on failure so founder can retry)
    await supabase
      .from('proposed_actions')
      .update({ status: executionError ? 'pending' : 'executed' })
      .eq('id', proposal.id);

    if (executionError) {
      return res.status(500).json({ ok: false, error: executionError });
    }

    // -----------------------------------------------------------------------
    // 9. Re-enqueue MissionController
    // -----------------------------------------------------------------------
    await enqueueReconcile({
      projectId,
      controller: 'MissionController',
      resourceId: missionId,
      reason: 'dependency_changed',
    });

    return res.json({ ok: true, result });
  },
);
