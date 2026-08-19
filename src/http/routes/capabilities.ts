import { Router } from 'express';
import { capabilities } from '../../capabilities/workbenchRegistry.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const capabilitiesRouter = Router();

capabilitiesRouter.use(requireFounder);

const PROJECT_HEALTH_CAPABILITY_ID = 'project-health-refresh-v1';
const PROJECT_HEALTH_RESOURCE_ID = `capability:${PROJECT_HEALTH_CAPABILITY_ID}`;
const DYNAMIC_CAPABILITIES = new Map([
  [PROJECT_HEALTH_CAPABILITY_ID, { controller: 'ProjectController', resourceId: PROJECT_HEALTH_RESOURCE_ID }],
]);

capabilitiesRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ capabilities });
});

capabilitiesRouter.post('/:capabilityId/runs', async (req: FounderRequest, res) => {
  const capabilityId = req.params.capabilityId;
  const runtime = DYNAMIC_CAPABILITIES.get(capabilityId);
  if (!runtime) {
    return res.status(404).json({ error: 'Capability does not have a dynamic runtime.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const projectSlug = typeof body.projectSlug === 'string' ? body.projectSlug.trim() : '';
  if (!projectSlug) {
    return res.status(400).json({ error: 'projectSlug is required' });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, slug, status')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${projectSlug}"` });
  if (project.status !== 'active') {
    return res.status(409).json({ error: `Project "${projectSlug}" is ${project.status}; dynamic capability runs require an active project.` });
  }

  try {
    const runId = await enqueueReconcile({
      projectId: String(project.id),
      controller: runtime.controller,
      resourceId: runtime.resourceId,
      reason: 'founder_triggered',
    });

    return res.status(202).json({
      run: {
        id: runId,
        capabilityId,
        projectSlug,
        state: 'queued',
        authority: 'read_only',
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enqueue dynamic capability run',
    });
  }
});

capabilitiesRouter.get('/runs/:runId', async (req: FounderRequest, res) => {
  const runId = req.params.runId;
  const { data: work, error: workError } = await supabase
    .from('controller_outbox')
    .select('id, project_id, controller, resource_id, reason, available_at, claimed_at, completed_at, attempt_count, last_error')
    .eq('id', runId)
    .maybeSingle();

  if (workError) return res.status(500).json({ error: workError.message });
  if (
    !work
    || work.controller !== 'ProjectController'
    || work.reason !== 'founder_triggered'
    || work.resource_id !== PROJECT_HEALTH_RESOURCE_ID
  ) {
    return res.status(404).json({ error: 'Dynamic capability run not found' });
  }

  const state = work.completed_at
    ? 'completed'
    : work.claimed_at
      ? 'running'
      : work.last_error
        ? 'retrying'
        : 'queued';

  let observation = null;
  if (state === 'completed') {
    const { data, error } = await supabase
      .from('provider_observations')
      .select('provider, resource_id, observed_state, observed_at')
      .eq('project_id', work.project_id)
      .eq('resource_type', 'repository')
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    observation = data ?? null;
  }

  res.set('Cache-Control', 'no-store');
  return res.json({
    run: {
      id: work.id,
      capabilityId: PROJECT_HEALTH_CAPABILITY_ID,
      state,
      attemptCount: Number(work.attempt_count ?? 0),
      hasRetryError: Boolean(work.last_error),
      queuedAt: work.available_at,
      claimedAt: work.claimed_at ?? null,
      completedAt: work.completed_at ?? null,
      observation,
    },
  });
});
