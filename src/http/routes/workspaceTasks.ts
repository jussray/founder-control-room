import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireWorkspaceUser, type FounderRequest } from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';

export const workspaceTasksRouter = Router();
workspaceTasksRouter.use(rateLimitFounderPermissions, requireWorkspaceUser);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUERY = 2_048;
const MAX_TASKS = 50;

function actor(req: FounderRequest) {
  const workspaceId = req.founder?.workspaceId;
  const userId = req.founder?.userId;
  return typeof workspaceId === 'string' && UUID.test(workspaceId)
    && typeof userId === 'string' && UUID.test(userId)
    ? { workspaceId, userId } : null;
}

function unavailable(res: import('express').Response) {
  return res.status(503).json({ error: 'Workspace tasks are unavailable; no execution was authorized.' });
}

workspaceTasksRouter.get('/tasks', async (req: FounderRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const owner = actor(req);
  if (!owner) return unavailable(res);
  const { data, error } = await supabase.from('fcr_workspace_tasks')
    .select('id,project_id,capability_id,operation,request_json,cadence_minutes,next_due_at,state,created_at')
    .eq('workspace_id', owner.workspaceId)
    .eq('owner_user_id', owner.userId)
    .order('created_at', { ascending: false }).limit(MAX_TASKS + 1);
  if (error) return unavailable(res);
  if ((data ?? []).length > MAX_TASKS) {
    return res.status(409).json({ error: 'Workspace task listing requires pagination.' });
  }
  return res.json({ tasks: data ?? [], executionAuthorized: false });
});

/** Registers a PAUSED task and REVOKED grant atomically, never runs it. */
workspaceTasksRouter.post('/tasks', async (req: FounderRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const owner = actor(req);
  if (!owner) return unavailable(res);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown> : {};
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const operation = body.operation;
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const cadenceMinutes = body.cadenceMinutes;
  if (!UUID.test(projectId) || operation !== 'search'
    || query.length < 1 || query.length > MAX_QUERY
    || !Number.isInteger(cadenceMinutes)
    || (cadenceMinutes as number) < 60 || (cadenceMinutes as number) > 10080
    || Object.keys(body).some(key => !['projectId', 'operation', 'query', 'cadenceMinutes'].includes(key))) {
    return res.status(400).json({ error: 'A project, bounded read-only search, and 60-10080 minute cadence are required.' });
  }
  // The database enforces this project-to-workspace FK again during the RPC.
  const { data: project, error: projectError } = await supabase.from('projects')
    .select('id').eq('id', projectId).eq('workspace_id', owner.workspaceId)
    .maybeSingle();
  if (projectError) return unavailable(res);
  if (!project) return res.status(404).json({ error: 'Project not found in this workspace.' });
  const { data: taskId, error } = await supabase.rpc('create_fcr_workspace_task_draft', {
    p_workspace_id: owner.workspaceId,
    p_owner_user_id: owner.userId,
    p_project_id: projectId,
    p_query: query,
    p_cadence_minutes: cadenceMinutes,
  });
  if (error || typeof taskId !== 'string' || !UUID.test(taskId)) return unavailable(res);
  return res.status(201).json({
    taskId, state: 'paused', grant: 'revoked',
    executionAuthorized: false, providerInvoked: false,
  });
});

workspaceTasksRouter.get('/tasks/:taskId/runs', async (req: FounderRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const owner = actor(req);
  if (!owner) return unavailable(res);
  if (!UUID.test(req.params.taskId)) return res.status(404).json({ error: 'Task not found.' });
  const { data: task, error: taskError } = await supabase.from('fcr_workspace_tasks')
    .select('id').eq('id', req.params.taskId)
    .eq('workspace_id', owner.workspaceId)
    .eq('owner_user_id', owner.userId).maybeSingle();
  if (taskError) return unavailable(res);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const { data, error } = await supabase.from('fcr_workspace_task_runs')
    .select('id,scheduled_for,claimed_at,expires_at,state,observed_at,evidence_fingerprint,provider_receipt_id,result_count')
    .eq('task_id', req.params.taskId)
    .eq('workspace_id', owner.workspaceId)
    .eq('owner_user_id', owner.userId)
    .order('claimed_at', { ascending: false }).limit(20);
  if (error) return unavailable(res);
  return res.json({ runs: data ?? [], evidenceIsIndependentVerification: false });
});
