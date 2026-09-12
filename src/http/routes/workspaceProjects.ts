import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireWorkspaceUser, type FounderRequest } from '../middleware/requireFounder.js';

export const workspaceProjectsRouter = Router();

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function workspaceId(req: FounderRequest): string | null {
  const id = req.founder?.workspaceId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function missingWorkspace(res: { status: (code: number) => { json: (body: object) => unknown } }) {
  return res.status(503).json({ error: 'Founder workspace assignment is required' });
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
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!slug || !name) {
    return res.status(400).json({ error: 'slug and name are required' });
  }
  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase alphanumeric segments separated by hyphens' });
  }

  const repoProvider = typeof body.repoProvider === 'string' ? body.repoProvider.trim() : 'github';
  const repoIdentifier = typeof body.repoIdentifier === 'string' && body.repoIdentifier.trim()
    ? body.repoIdentifier.trim()
    : null;
  const stack = typeof body.stack === 'string' && body.stack.trim() ? body.stack.trim() : null;
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
    screen: 'workspace-project-api',
    metadata: {
      route: 'POST /workspace/projects',
      registered_by: req.founder?.email,
      workspace_id: ownerWorkspaceId,
    },
  });

  return res.status(201).json({ project });
});
