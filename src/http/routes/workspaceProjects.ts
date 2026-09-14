import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireWorkspaceUser, type FounderRequest } from '../middleware/requireFounder.js';

export const workspaceProjectsRouter = Router();

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHIEF_COMPOSER_VERSION = 'chief-composer-v1';
const PROJECT_TYPES = {
  software_product: {
    label: 'Software / product',
    title: 'Prove one real user path before expanding the build.',
    firstGate: 'Choose the smallest user outcome, run it end to end, and capture browser/runtime evidence.',
    reasoning: 'A product becomes easier to steer when one complete path is true before more screens, agents, or integrations are added.',
  },
  service_business: {
    label: 'Service / business',
    title: 'Prove one paid or accepted deliverable before automating delivery.',
    firstGate: 'Define one buyer, one promised outcome, one acceptance condition, and the shortest path to delivery.',
    reasoning: 'A service Control Room should protect the customer promise first, then automate only the repeatable parts.',
  },
  commerce: {
    label: 'Commerce',
    title: 'Prove offer, checkout, and fulfillment truth before scaling traffic.',
    firstGate: 'Verify one product from storefront to checkout to fulfillment evidence with price and authority boundaries intact.',
    reasoning: 'Traffic compounds whatever already exists. Chief should prove the money path before amplifying it.',
  },
  content_community: {
    label: 'Content / community',
    title: 'Prove one repeatable audience loop without weakening trust.',
    firstGate: 'Choose one audience, one useful recurring format, one response signal, and one moderation or consent boundary.',
    reasoning: 'Audience systems compound when the feedback loop is measurable and the trust boundary stays explicit.',
  },
  research_decision: {
    label: 'Research / decision',
    title: 'Define the decision and evidence standard before collecting more information.',
    firstGate: 'Write the decision, the evidence that could change it, and the stop condition for further research.',
    reasoning: 'Research should reduce uncertainty around a decision, not become an endless collection surface.',
  },
  internal_ops: {
    label: 'Internal operations',
    title: 'Prove the operator outcome and rollback before broad adoption.',
    firstGate: 'Pick one recurring operation, define success, failure, rollback, and the receipt that proves the outcome.',
    reasoning: 'Internal automation is safest when the human recovery path survives the automation.',
  },
} as const;

type ProjectType = keyof typeof PROJECT_TYPES;

type ComposerInput = {
  name: string;
  slug: string;
  projectType: ProjectType;
  mission: string;
  currentState: string;
  evidenceNotes: string;
};

function workspaceId(req: FounderRequest): string | null {
  const id = req.founder?.workspaceId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function missingWorkspace(res: { status: (code: number) => { json: (body: object) => unknown } }) {
  return res.status(503).json({ error: 'Founder workspace assignment is required' });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseComposerInput(body: Record<string, unknown>): { input?: ComposerInput; error?: string } {
  const name = text(body.name);
  const slug = text(body.slug);
  const projectType = text(body.projectType) as ProjectType;
  const mission = text(body.mission);
  const currentState = text(body.currentState);
  const evidenceNotes = text(body.evidenceNotes);

  if (!name || !slug) return { error: 'slug and name are required' };
  if (!SLUG_PATTERN.test(slug)) {
    return { error: 'slug must be lowercase alphanumeric segments separated by hyphens' };
  }
  if (!Object.prototype.hasOwnProperty.call(PROJECT_TYPES, projectType)) {
    return { error: 'projectType must be one of the supported Chief Composer project types' };
  }
  if (mission.length < 8) return { error: 'mission must describe the founder outcome in at least 8 characters' };
  if (mission.length > 500) return { error: 'mission must be 500 characters or fewer' };
  if (currentState.length > 700) return { error: 'currentState must be 700 characters or fewer' };
  if (evidenceNotes.length > 1000) return { error: 'evidenceNotes must be 1000 characters or fewer' };

  return { input: { name, slug, projectType, mission, currentState, evidenceNotes } };
}

function chiefRecommendation(ownerWorkspaceId: string, input: ComposerInput) {
  const template = PROJECT_TYPES[input.projectType];
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({
      version: CHIEF_COMPOSER_VERSION,
      workspaceId: ownerWorkspaceId,
      name: input.name,
      slug: input.slug,
      projectType: input.projectType,
      mission: input.mission,
      currentState: input.currentState,
      evidenceNotes: input.evidenceNotes,
    }))
    .digest('hex')
    .slice(0, 24);

  return {
    id: `${CHIEF_COMPOSER_VERSION}:${fingerprint}`,
    version: CHIEF_COMPOSER_VERSION,
    projectType: input.projectType,
    projectTypeLabel: template.label,
    title: template.title,
    firstGate: template.firstGate,
    reasoning: template.reasoning,
    authorityBoundary: 'Chief recommends. The founder approves this exact project plan. Chief creates no provider connection and grants no merge, deployment, spending, communication, or execution authority.',
  };
}

async function projectInWorkspace(slug: string, ownerWorkspaceId: string) {
  return supabase
    .from('projects')
    .select('id, workspace_id, slug, name, repo_provider, repo_identifier, stack, status, risk_level, created_at, updated_at')
    .eq('workspace_id', ownerWorkspaceId)
    .eq('slug', slug)
    .maybeSingle();
}

/**
 * Tenant-safe project registry.
 *
 * This router deliberately exposes only workspace-aware operations. Existing
 * /projects routes remain platform-owner-only until each capability has its own
 * tenant-scoping proof.
 */
workspaceProjectsRouter.get('/', requireWorkspaceUser, async (req: FounderRequest, res) => {
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) return missingWorkspace(res);

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, workspace_id, slug, name, repo_provider, repo_identifier, stack, status, risk_level, created_at, updated_at')
    .eq('workspace_id', ownerWorkspaceId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ workspaceId: ownerWorkspaceId, projects: projects ?? [] });
});

workspaceProjectsRouter.post('/recommendation', requireWorkspaceUser, async (req: FounderRequest, res) => {
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) return missingWorkspace(res);

  const parsed = parseComposerInput(req.body as Record<string, unknown>);
  if (!parsed.input) return res.status(400).json({ error: parsed.error });

  return res.json({
    workspaceId: ownerWorkspaceId,
    recommendation: chiefRecommendation(ownerWorkspaceId, parsed.input),
  });
});

workspaceProjectsRouter.get('/:slug', requireWorkspaceUser, async (req: FounderRequest, res) => {
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) return missingWorkspace(res);

  const slug = req.params.slug;
  const { data: project, error } = await projectInWorkspace(slug, ownerWorkspaceId);

  if (error) return res.status(500).json({ error: error.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}" in this workspace` });
  return res.json({ project });
});

workspaceProjectsRouter.post('/', requireWorkspaceUser, async (req: FounderRequest, res) => {
  const ownerWorkspaceId = workspaceId(req);
  if (!ownerWorkspaceId) return missingWorkspace(res);

  const body = req.body as Record<string, unknown>;
  const parsed = parseComposerInput(body);
  if (!parsed.input) return res.status(400).json({ error: parsed.error });
  const { name, slug } = parsed.input;

  const recommendation = chiefRecommendation(ownerWorkspaceId, parsed.input);
  if (body.chiefApproval !== true) {
    return res.status(400).json({ error: 'Founder approval of the current Chief recommendation is required before project creation' });
  }
  if (text(body.chiefRecommendationId) !== recommendation.id) {
    return res.status(409).json({ error: 'Chief recommendation is stale or does not match this exact project. Request a fresh recommendation.' });
  }

  const repoProvider = text(body.repoProvider) || 'github';
  const repoIdentifier = text(body.repoIdentifier) || null;
  const stack = text(body.stack) || null;
  const riskLevel = body.riskLevel === 'low' || body.riskLevel === 'high' ? body.riskLevel : 'medium';

  const { data: existing, error: existingError } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', ownerWorkspaceId)
    .eq('slug', slug)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (existing) return res.status(409).json({ error: `Project "${slug}" is already registered in this workspace.` });

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: ownerWorkspaceId,
      slug,
      name,
      repo_provider: repoProvider,
      repo_identifier: repoIdentifier,
      stack,
      risk_level: riskLevel,
      status: 'active',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('project_events').insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: 'workspace_project_registered',
    severity: 'info',
    screen: 'chief-first-run-composer',
    metadata: {
      route: 'POST /workspace/projects',
      registered_by: req.founder?.email,
      workspace_id: ownerWorkspaceId,
      composer: {
        version: CHIEF_COMPOSER_VERSION,
        project_type: parsed.input.projectType,
        mission: parsed.input.mission,
        current_state: parsed.input.currentState || null,
        evidence_notes: parsed.input.evidenceNotes || null,
        recommendation_id: recommendation.id,
        recommendation_title: recommendation.title,
        first_gate: recommendation.firstGate,
        authority_boundary: recommendation.authorityBoundary,
        founder_approved: true,
        approval_scope: `workspace:${ownerWorkspaceId}/project:${slug}/create`,
      },
    },
  });

  return res.status(201).json({ project, chief: { recommendation, approved: true } });
});
