import { createHash } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import {
  requestChiefControlRoomRecommendation,
  type ChiefControlRoomRecommendation,
} from '../../lib/chiefControlRoomRecommendation.js';
import { requireWorkspaceUser, type FounderRequest } from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';

export const workspaceProjectsRouter = Router();
workspaceProjectsRouter.use(rateLimitFounderPermissions, requireWorkspaceUser);

type DbRecord = Record<string, unknown>;
type ControlRoomProfile = {
  projectType: string;
  mission: string;
  currentState: string;
};

type ComposerInput = {
  name: string;
  slug: string;
  repoIdentifier: string | null;
  stack: string | null;
  controlRoom: ControlRoomProfile;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_TYPES = new Set([
  'product-app', 'website', 'ai-agent', 'business-company', 'client-project',
  'content-brand', 'store-commerce', 'research-decision', 'other',
]);
const MISSIONS = new Set(['build', 'fix', 'launch', 'grow', 'operate', 'decide', 'prove']);
const PROJECT_STATES = new Set([
  'idea', 'planning', 'building', 'live', 'broken', 'needs-improvement', 'unsure',
]);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText ? valueText : null;
}

function record(value: unknown): DbRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DbRecord : null;
}

function workspaceId(req: FounderRequest): string | null {
  const value = req.founder?.workspaceId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseComposer(body: DbRecord): { input?: ComposerInput; error?: string } {
  const project = record(body.project) ?? body;
  const controlRoom = record(body.controlRoom);
  const name = text(project.name);
  const slug = text(project.slug);
  const projectType = text(controlRoom?.projectType);
  const mission = text(controlRoom?.mission);
  const currentState = text(controlRoom?.currentState);

  if (!name || !slug) return { error: 'project.slug and project.name are required' };
  if (!SLUG_PATTERN.test(slug)) {
    return { error: 'project.slug must be lowercase alphanumeric segments separated by hyphens' };
  }
  if (!PROJECT_TYPES.has(projectType) || !MISSIONS.has(mission) || !PROJECT_STATES.has(currentState)) {
    return { error: 'controlRoom must include a supported projectType, mission, and currentState' };
  }

  return {
    input: {
      name,
      slug,
      repoIdentifier: optionalText(project.repoIdentifier),
      stack: optionalText(project.stack),
      controlRoom: { projectType, mission, currentState },
    },
  };
}

function chiefInput(input: ComposerInput) {
  return {
    projectName: input.name,
    projectType: input.controlRoom.projectType,
    mission: input.controlRoom.mission,
    currentState: input.controlRoom.currentState,
    repoIdentifier: input.repoIdentifier,
    stack: input.stack,
  };
}

function workspaceRecommendationEnvelope(
  ownerWorkspaceId: string,
  input: ComposerInput,
  chief: ChiefControlRoomRecommendation,
) {
  const canonical = JSON.stringify({
    contract: 'founder-control-room/workspace-chief-acceptance@v1',
    workspaceId: ownerWorkspaceId,
    project: {
      name: input.name,
      slug: input.slug,
      repoIdentifier: input.repoIdentifier,
      stack: input.stack,
      controlRoom: input.controlRoom,
    },
    chiefRecommendationHash: chief.recommendationHash,
  });
  const fingerprint = createHash('sha256').update(canonical).digest('hex');

  return {
    id: `workspace-chief-acceptance-v1:${fingerprint}`,
    version: chief.contract,
    selectedBy: chief.selectedBy,
    recommendationHash: chief.recommendationHash,
    title: chief.title,
    detail: [chief.focus, chief.stateGuidance].filter(Boolean).join(' '),
    firstGate: chief.nextGate,
    capabilityIntents: chief.capabilityIntents,
    evidencePriorities: chief.evidencePriorities,
    authorityBoundary: 'Recommendation only. Creating this room grants no provider, credential, merge, deploy, spending, communication, deletion, or execution authority.',
  };
}

async function currentWorkspaceRecommendation(ownerWorkspaceId: string, input: ComposerInput) {
  const chief = await requestChiefControlRoomRecommendation(chiefInput(input));
  return workspaceRecommendationEnvelope(ownerWorkspaceId, input, chief);
}

async function profileMap(projectIds: string[]) {
  const map = new Map<string, ControlRoomProfile>();
  if (projectIds.length === 0) return map;

  const { data, error } = await supabase
    .from('project_events')
    .select('project_id, event_type, metadata, created_at')
    .in('project_id', projectIds)
    .eq('event_type', 'founder_onboarding_bootstrapped')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as DbRecord[]) {
    const projectId = text(row.project_id);
    if (!projectId || map.has(projectId)) continue;
    const metadata = record(row.metadata);
    const profile = record(metadata?.controlRoomProfile);
    const projectType = text(profile?.projectType);
    const mission = text(profile?.mission);
    const currentState = text(profile?.currentState);
    if (PROJECT_TYPES.has(projectType) && MISSIONS.has(mission) && PROJECT_STATES.has(currentState)) {
      map.set(projectId, { projectType, mission, currentState });
    }
  }
  return map;
}

workspaceProjectsRouter.get('/me', (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  return res.json({ founder: req.founder });
});

workspaceProjectsRouter.get('/projects', async (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) {
    return res.status(503).json({ error: 'Founder workspace assignment is required' });
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, workspace_id, slug, name, repo_provider, repo_identifier, stack, status, risk_level, created_at, updated_at')
    .eq('workspace_id', ownerWorkspaceId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as DbRecord[];
  let profiles = new Map<string, ControlRoomProfile>();
  try {
    profiles = await profileMap(rows.map((row) => text(row.id)).filter(Boolean));
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Profile evidence query failed' });
  }

  const projects = rows.map((row) => ({
    id: text(row.id),
    slug: optionalText(row.slug),
    name: optionalText(row.name),
    repoProvider: optionalText(row.repo_provider),
    repoIdentifier: optionalText(row.repo_identifier),
    stack: optionalText(row.stack),
    status: optionalText(row.status),
    riskLevel: optionalText(row.risk_level),
    controlRoomProfile: profiles.get(text(row.id)) ?? null,
    connections: [],
  }));

  return res.json({
    complete: projects.length > 0,
    workspaceId: ownerWorkspaceId,
    projects,
    composerProfileEvidence: {
      status: 'available',
      founderDeclared: true,
      authorityGranted: false,
    },
    authorityBoundary: {
      loginGrantsExecution: false,
      providerSlotsAvailable: false,
      mergeRequiresSeparateApproval: true,
      deployRequiresSeparateApproval: true,
      productionMutationRequiresSeparateApproval: true,
    },
  });
});

workspaceProjectsRouter.post('/projects/recommendation', async (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) {
    return res.status(503).json({ error: 'Founder workspace assignment is required' });
  }
  const parsed = parseComposer(req.body as DbRecord);
  if (!parsed.input) return res.status(400).json({ error: parsed.error });

  try {
    const recommendation = await currentWorkspaceRecommendation(ownerWorkspaceId, parsed.input);
    return res.json({
      recommendation,
      truth: {
        chiefCreatesControlRoom: false,
        chiefGrantsExecution: false,
        stateAuthority: 'founder-control-room',
        evidenceAuthority: 'founder-control-room',
      },
    });
  } catch {
    return res.status(503).json({
      error: 'Chief recommendation is unavailable. Control Room creation remains fail-closed.',
    });
  }
});

workspaceProjectsRouter.post('/projects', async (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) {
    return res.status(503).json({ error: 'Founder workspace assignment is required' });
  }

  const body = req.body as DbRecord;
  const parsed = parseComposer(body);
  if (!parsed.input) return res.status(400).json({ error: parsed.error });

  if (body.chiefApproval !== true) {
    return res.status(400).json({ error: 'Founder approval of the current Chief recommendation is required' });
  }

  let expected;
  try {
    expected = await currentWorkspaceRecommendation(ownerWorkspaceId, parsed.input);
  } catch {
    return res.status(503).json({
      error: 'Chief recommendation could not be revalidated. Control Room creation remains fail-closed.',
    });
  }

  if (text(body.chiefRecommendationId) !== expected.id) {
    return res.status(409).json({ error: 'Chief recommendation is stale. Request and approve a fresh recommendation.' });
  }
  if (Array.isArray(body.providers) && body.providers.length > 0) {
    return res.status(403).json({ error: 'Workspace onboarding cannot declare provider authority or provider slots' });
  }

  const { data: existing, error: existingError } = await supabase
    .from('projects')
    .select('id, workspace_id')
    .eq('slug', parsed.input.slug)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (existing) {
    return res.status(409).json({ error: `Project slug "${parsed.input.slug}" is already registered.` });
  }

  const eventMetadata = {
    route: 'POST /workspace/projects',
    workspaceId: ownerWorkspaceId,
    projectCreated: true,
    requestedProviders: [],
    createdProviders: [],
    controlRoomProfile: parsed.input.controlRoom,
    controlRoomProfileAuthority: 'founder-declared',
    chiefRecommendation: expected,
    chiefRecommendationApproved: true,
    authorityGranted: false,
    credentialsStored: false,
  };

  const { data: createdProject, error } = await supabase.rpc(
    'create_workspace_project_with_onboarding_event',
    {
      p_workspace_id: ownerWorkspaceId,
      p_slug: parsed.input.slug,
      p_name: parsed.input.name,
      p_repo_provider: parsed.input.repoIdentifier ? 'github' : 'none',
      p_repo_identifier: parsed.input.repoIdentifier,
      p_stack: parsed.input.stack,
      p_event_metadata: eventMetadata,
    },
  );
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: `Project slug "${parsed.input.slug}" is already registered.` });
    }
    return res.status(500).json({
      error: 'Project and onboarding evidence could not be created atomically',
    });
  }

  const project = record(createdProject);
  if (!project || !text(project.id)) {
    return res.status(500).json({ error: 'Atomic project creation returned no project record' });
  }

  return res.status(201).json({
    ok: true,
    project,
    controlRoomProfile: parsed.input.controlRoom,
    chief: { recommendation: expected, approved: true },
    truth: {
      credentialsStored: false,
      providersConnected: false,
      mergeApproved: false,
      deploymentApproved: false,
      executionApproved: false,
    },
  });
});