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
const FOUNDER_CONTENT_OBSERVATION_KIND = 'fcr/founder-content-provider-observation@v1';
const FOUNDER_CONTENT_RESOURCE_TYPE = 'founder_content_post';
const LINKEDIN_POST_URN = /^urn:li:(share|ugcPost):[A-Za-z0-9_-]+$/;
const RFC3339_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DYNAMIC_CAPABILITIES = new Map([
  [PROJECT_HEALTH_CAPABILITY_ID, { controller: 'ProjectController', resourcePrefix: PROJECT_HEALTH_RESOURCE_PREFIX }],
]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function linkedinPostIdentity(value: unknown): { postUrn: string; permalink: string } | null {
  const raw = asText(value);
  if (!raw) return null;

  if (LINKEDIN_POST_URN.test(raw)) {
    return {
      postUrn: raw,
      permalink: `https://www.linkedin.com/feed/update/${raw}/`,
    };
  }

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || (hostname !== 'linkedin.com' && hostname !== 'www.linkedin.com')) {
      return null;
    }
    const decodedPath = decodeURIComponent(url.pathname);
    const match = decodedPath.match(/\/feed\/update\/(urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+)\/?$/);
    if (!match?.[1] || !LINKEDIN_POST_URN.test(match[1])) return null;
    return {
      postUrn: match[1],
      permalink: `https://www.linkedin.com/feed/update/${match[1]}/`,
    };
  } catch {
    return null;
  }
}

async function resolveActiveProject(projectSlug: string, activeUse = 'dynamic capability runs') {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, slug, status')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (error) return { project: null, error: error.message, status: 500 } as const;
  if (!project) return { project: null, error: `No project registered with slug "${projectSlug}"`, status: 404 } as const;
  if (project.status !== 'active') {
    return {
      project: null,
      error: `Project "${projectSlug}" is ${project.status}; ${activeUse} require an active project.`,
      status: 409,
    } as const;
  }
  return { project, error: null, status: 200 } as const;
}

capabilitiesRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ capabilities });
});

/**
 * Record a LinkedIn post that was published outside FCR without pretending FCR
 * performed or provider-verified the publication. This is an observation-only
 * bridge for founder-attested external state. It deliberately accepts no
 * engagement metrics and cannot mint publication or analytics authority.
 */
capabilitiesRouter.post('/founder-content/linkedin-observations', async (req: FounderRequest, res) => {
  const body = asRecord(req.body);
  const projectSlug = asText(body.projectSlug);
  const identity = linkedinPostIdentity(body.post ?? body.postUrn ?? body.permalink);
  const publicationAttested = body.publicationAttested === true;
  const publishedAtRaw = asText(body.publishedAt);
  const contentHashRaw = asText(body.contentHash).toLowerCase();
  const publishedAtMs = publishedAtRaw && RFC3339_TIMESTAMP.test(publishedAtRaw) ? Date.parse(publishedAtRaw) : null;
  const observedAtMs = Date.now();

  if (!projectSlug) return res.status(400).json({ error: 'projectSlug is required' });
  if (!identity) {
    return res.status(400).json({
      error: 'post must be an exact LinkedIn post URN or canonical /feed/update/ permalink',
    });
  }
  if (!publicationAttested) {
    return res.status(400).json({
      error: 'publicationAttested=true is required for a manual publication observation',
    });
  }
  if (publishedAtRaw && (!RFC3339_TIMESTAMP.test(publishedAtRaw) || publishedAtMs === null || Number.isNaN(publishedAtMs))) {
    return res.status(400).json({ error: 'publishedAt must be an RFC3339 timestamp with an explicit timezone when provided' });
  }
  if (publishedAtMs !== null && publishedAtMs > observedAtMs + MAX_CLOCK_SKEW_MS) {
    return res.status(400).json({ error: 'publishedAt cannot be materially future-dated' });
  }
  if (contentHashRaw && !SHA256.test(contentHashRaw)) {
    return res.status(400).json({ error: 'contentHash must be a SHA-256 hex digest when provided' });
  }

  const resolved = await resolveActiveProject(projectSlug, 'founder-content observations');
  if (!resolved.project) return res.status(resolved.status).json({ error: resolved.error });
  if (!req.founder) {
    return res.status(500).json({ error: 'Founder identity binding unavailable' });
  }

  const observedAt = new Date(observedAtMs).toISOString();
  const observedState = {
    kind: FOUNDER_CONTENT_OBSERVATION_KIND,
    platform: 'linkedin',
    postUrn: identity.postUrn,
    permalink: identity.permalink,
    publication: {
      state: 'USER_ATTESTED',
      providerVerified: false,
      publishedAt: publishedAtMs === null ? null : new Date(publishedAtMs).toISOString(),
    },
    metrics: {
      state: 'UNKNOWN',
    },
    contentHash: contentHashRaw || null,
    source: 'manual_founder_attestation',
    attestation: {
      founderUserId: req.founder.userId,
      observedAt,
    },
    authority: {
      publication: false,
      analyticsClaim: false,
      externalMutation: false,
    },
    observedAt,
  };

  const sourceEventId = `fcae:${randomUUID()}`;
  const { error: attestationEventError } = await supabase
    .from('founder_content_attestation_events')
    .insert({
      event_id: sourceEventId,
      project_id: resolved.project.id,
      founder_user_id: req.founder.userId,
      provider: 'linkedin',
      resource_type: FOUNDER_CONTENT_RESOURCE_TYPE,
      resource_id: identity.postUrn,
      observed_state: observedState,
      observed_at: observedAt,
    });

  if (attestationEventError) {
    return res.status(500).json({
      error: `LinkedIn attestation event persistence failed: ${attestationEventError.message}`,
    });
  }

  const { error: observationError } = await supabase
    .from('provider_observations')
    .upsert({
      project_id: resolved.project.id,
      provider: 'linkedin',
      resource_type: FOUNDER_CONTENT_RESOURCE_TYPE,
      resource_id: identity.postUrn,
      observed_state: observedState,
      observed_at: observedAt,
      source_event_id: sourceEventId,
    }, { onConflict: 'project_id,provider,resource_type,resource_id' });

  if (observationError) {
    return res.status(500).json({ error: `LinkedIn observation persistence failed: ${observationError.message}` });
  }

  return res
    .status(200)
    .set('Cache-Control', 'no-store')
    .json({
      observation: observedState,
      sourceEventId,
      persistence: 'recorded',
      publicationTruth: 'USER_ATTESTED',
      providerVerified: false,
      metricsState: 'UNKNOWN',
      authorityGranted: false,
    });
});

capabilitiesRouter.get('/founder-content/linkedin-observations', async (req: FounderRequest, res) => {
  const projectSlug = asText(req.query.projectSlug);
  const identity = linkedinPostIdentity(req.query.post);

  if (!projectSlug) return res.status(400).json({ error: 'projectSlug is required' });
  if (!identity) {
    return res.status(400).json({
      error: 'post must be an exact LinkedIn post URN or canonical /feed/update/ permalink',
    });
  }

  const resolved = await resolveActiveProject(projectSlug, 'founder-content observations');
  if (!resolved.project) return res.status(resolved.status).json({ error: resolved.error });

  const { data: observation, error: observationError } = await supabase
    .from('provider_observations')
    .select('provider, resource_type, resource_id, observed_state, observed_at, source_event_id')
    .eq('project_id', resolved.project.id)
    .eq('provider', 'linkedin')
    .eq('resource_type', FOUNDER_CONTENT_RESOURCE_TYPE)
    .eq('resource_id', identity.postUrn)
    .maybeSingle();

  if (observationError) {
    return res.status(500).json({ error: `LinkedIn observation read failed: ${observationError.message}` });
  }
  if (!observation) return res.status(404).json({ error: 'LinkedIn founder-content observation not found' });

  return res
    .status(200)
    .set('Cache-Control', 'no-store')
    .json({ observation });
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

  const resolved = await resolveActiveProject(projectSlug);
  if (!resolved.project) return res.status(resolved.status).json({ error: resolved.error });

  try {
    const invocationResourceId = `${runtime.resourcePrefix}${randomUUID()}`;
    const runId = await enqueueReconcile({
      projectId: String(resolved.project.id),
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
