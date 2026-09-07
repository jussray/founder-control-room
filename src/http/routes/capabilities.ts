import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { capabilities } from '../../capabilities/workbenchRegistry.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const capabilitiesRouter = Router();

capabilitiesRouter.use(requireFounder);

const PROJECT_HEALTH_CAPABILITY_ID = 'project-health-refresh-v1';
const PROJECT_HEALTH_RESOURCE_PREFIX = `capability:${PROJECT_HEALTH_CAPABILITY_ID}:invocation:`;
const DYNAMIC_CAPABILITIES = new Map([
  [PROJECT_HEALTH_CAPABILITY_ID, { controller: 'ProjectController', resourcePrefix: PROJECT_HEALTH_RESOURCE_PREFIX }],
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
    const invocationResourceId = `${runtime.resourcePrefix}${randomUUID()}`;
    const runId = await enqueueReconcile({
      projectId: String(project.id),
      controller: runtime.controller,
      resourceId: invocationResourceId,
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
    || typeof work.resource_id !== 'string'
    || !work.resource_id.startsWith(PROJECT_HEALTH_RESOURCE_PREFIX)
  ) {
    return res.status(404).json({ error: 'Dynamic capability run not found' });
  }

  let state = work.completed_at
    ? work.last_error
      ? 'failed'
      : 'completed'
    : work.claimed_at
      ? 'running'
      : work.last_error
        ? 'retrying'
        : 'queued';

  let result = null;
  let observation = null;
  let observationState: 'matched' | 'superseded' | 'unavailable' | 'not_applicable' | null = null;

  if (state === 'completed') {
    const { data: runResult, error: runResultError } = await supabase
      .from('reconciliation_runs')
      .select('status, observed_changes, proposed_actions, requires_approval, message, started_at, completed_at')
      .eq('project_id', work.project_id)
      .eq('controller', work.controller)
      .eq('resource_id', work.resource_id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runResultError) return res.status(500).json({ error: runResultError.message });
    if (!runResult) {
      state = 'completed_unverified';
    } else {
      result = runResult;
      const observedChanges = Array.isArray(runResult.observed_changes) ? runResult.observed_changes : [];
      const commitChange = observedChanges.find((change: unknown) => {
        if (!change || typeof change !== 'object') return false;
        const record = change as Record<string, unknown>;
        return record.resourceType === 'repository'
          && record.field === 'commitSha'
          && typeof record.resourceId === 'string'
          && typeof record.newValue === 'string';
      }) as Record<string, unknown> | undefined;

      if (!commitChange) {
        observationState = 'not_applicable';
      } else {
        const expectedResourceId = String(commitChange.resourceId);
        const expectedCommitSha = String(commitChange.newValue);
        const { data: currentObservation, error: observationError } = await supabase
          .from('provider_observations')
          .select('provider, resource_id, observed_state, observed_at')
          .eq('project_id', work.project_id)
          .eq('resource_type', 'repository')
          .eq('resource_id', expectedResourceId)
          .maybeSingle();

        if (observationError) return res.status(500).json({ error: observationError.message });
        if (!currentObservation) {
          observationState = 'unavailable';
        } else {
          const observedState = currentObservation.observed_state;
          const observedCommitSha = observedState && typeof observedState === 'object'
            ? (observedState as Record<string, unknown>).commitSha
            : null;
          if (observedCommitSha === expectedCommitSha) {
            observation = currentObservation;
            observationState = 'matched';
          } else {
            observationState = 'superseded';
          }
        }
      }
    }
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
      result,
      observation,
      observationState,
    },
  });
});
