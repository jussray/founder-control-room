import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { AUTHORITY_LEVELS } from '../../lib/authorityLevels.js';
import {
  PLUGIN_CATALOG,
  PLUGIN_CENTER_CONTRACT,
  pluginDescriptorFor,
  pluginRiskFor,
  summarizePluginConnections,
  type PluginConnectionSnapshot,
} from '../../lib/pluginCenter.js';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const pluginCenterRouter = Router();
pluginCenterRouter.use(requireFounder);

type DbRecord = Record<string, unknown>;

interface ProjectLookup {
  id: string;
  slug: string;
  name: string;
}

interface PluginPermissionGrantSnapshot {
  id: string;
  projectId: string;
  projectSlug: string | null;
  projectName: string | null;
  connectionId: string | null;
  grantType: string;
  toolRule: string;
  reason: string | null;
  requestedBy: string;
  usageLimit: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

const MAX_TEMP_GRANT_MS = 24 * 60 * 60 * 1000;
const SECRETISH_PATTERN = /(github_pat_|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|TOKEN|SECRET|PASSWORD|SERVICE_ROLE|API_KEY|ACCESS_KEY)/i;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recordOrNull(value: unknown): DbRecord | null {
  if (!value || typeof value !== 'object') return null;
  return value as DbRecord;
}

function relatedRecord(value: unknown): DbRecord | null {
  if (Array.isArray(value)) return recordOrNull(value[0]);
  return recordOrNull(value);
}

function projectFromRelation(value: unknown): ProjectLookup | null {
  const row = relatedRecord(value);
  if (!row) return null;
  const id = stringOrNull(row.id);
  const slug = stringOrNull(row.slug);
  const name = stringOrNull(row.name);
  if (!id || !slug || !name) return null;
  return { id, slug, name };
}

function normalizeConnection(row: DbRecord): PluginConnectionSnapshot {
  const type = stringOrNull(row.connection_type) ?? 'other';
  const project = projectFromRelation(row.projects);
  const descriptor = pluginDescriptorFor(type);
  const authorityLevel = stringOrNull(row.authority_level);
  const requiredApproval = stringOrNull(row.required_approval);

  return {
    id: stringOrNull(row.id) ?? '',
    projectId: stringOrNull(row.project_id) ?? project?.id ?? '',
    projectSlug: project?.slug ?? null,
    projectName: project?.name ?? null,
    type,
    label: stringOrNull(row.label),
    status: stringOrNull(row.status) ?? 'error',
    authorityLevel,
    capabilities: stringArray(row.capabilities),
    dataBoundary: stringOrNull(row.data_boundary),
    requiredApproval,
    secretRef: stringOrNull(row.secret_ref),
    lastCheckedAt: stringOrNull(row.last_checked_at),
    updatedAt: stringOrNull(row.updated_at),
    catalogLabel: descriptor?.label ?? null,
    risk: pluginRiskFor(authorityLevel, requiredApproval),
  };
}

function normalizeGrant(row: DbRecord): PluginPermissionGrantSnapshot {
  const project = projectFromRelation(row.projects);
  return {
    id: stringOrNull(row.id) ?? '',
    projectId: stringOrNull(row.project_id) ?? project?.id ?? '',
    projectSlug: project?.slug ?? null,
    projectName: project?.name ?? null,
    connectionId: stringOrNull(row.connection_id),
    grantType: stringOrNull(row.grant_type) ?? 'tool_rule',
    toolRule: stringOrNull(row.tool_rule) ?? '',
    reason: stringOrNull(row.reason),
    requestedBy: stringOrNull(row.requested_by) ?? 'founder',
    usageLimit: stringOrNull(row.usage_limit),
    expiresAt: stringOrNull(row.expires_at) ?? '',
    revokedAt: stringOrNull(row.revoked_at),
    createdAt: stringOrNull(row.created_at) ?? '',
  };
}

function secretLike(value: string): boolean {
  return SECRETISH_PATTERN.test(value);
}

function temporaryGrantExpiry(body: DbRecord): string | null {
  const now = Date.now();
  const expiresAt = stringOrNull(body.expiresAt);
  if (expiresAt) {
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed) || parsed <= now || parsed - now > MAX_TEMP_GRANT_MS) return null;
    return new Date(parsed).toISOString();
  }

  const rawDuration = body.durationHours;
  const durationHours = rawDuration === undefined ? 24 : Number(rawDuration);
  if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24) return null;
  return new Date(now + durationHours * 60 * 60 * 1000).toISOString();
}

async function fetchProjectBySlug(slug: string): Promise<{ project: ProjectLookup | null; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { project: null, error: error.message };
  const row = recordOrNull(data);
  if (!row) return { project: null, error: null };
  const id = stringOrNull(row.id);
  const projectSlug = stringOrNull(row.slug);
  const name = stringOrNull(row.name);
  if (!id || !projectSlug || !name) return { project: null, error: 'Project row is malformed' };
  return { project: { id, slug: projectSlug, name }, error: null };
}

async function connectionBelongsToProject(connectionId: string, projectId: string): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('project_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: Boolean(data), error: null };
}

pluginCenterRouter.get('/', async (_req: FounderRequest, res) => {
  const { data: connectionRows, error: connectionsError } = await supabase
    .from('project_connections')
    .select('id, project_id, connection_type, label, status, authority_level, capabilities, data_boundary, required_approval, secret_ref, last_checked_at, updated_at, projects(id, slug, name)')
    .order('updated_at', { ascending: false });

  if (connectionsError) return res.status(500).json({ error: connectionsError.message });

  const { data: grantRows, error: grantsError } = await supabase
    .from('plugin_permission_grants')
    .select('id, project_id, connection_id, grant_type, tool_rule, reason, requested_by, usage_limit, expires_at, revoked_at, created_at, projects(id, slug, name)')
    .is('revoked_at', null)
    .order('expires_at', { ascending: true })
    .limit(50);

  if (grantsError) return res.status(500).json({ error: grantsError.message });

  const connections = (connectionRows ?? []).map((row) => normalizeConnection(row as DbRecord));
  const temporaryGrants = (grantRows ?? []).map((row) => normalizeGrant(row as DbRecord));

  return res.json({
    contract: PLUGIN_CENTER_CONTRACT,
    authorityLevels: AUTHORITY_LEVELS,
    catalog: PLUGIN_CATALOG,
    summary: {
      ...summarizePluginConnections(connections),
      activeTemporaryGrants: temporaryGrants.length,
    },
    connections,
    temporaryGrants,
  });
});

pluginCenterRouter.post('/grants', async (req: FounderRequest, res) => {
  const body = req.body as DbRecord;
  const projectSlug = stringOrNull(body.projectSlug);
  const toolRule = stringOrNull(body.toolRule);
  const grantType = stringOrNull(body.grantType) ?? 'tool_rule';
  const connectionId = stringOrNull(body.connectionId);
  const reason = stringOrNull(body.reason);
  const usageLimit = stringOrNull(body.usageLimit);
  const expiresAt = temporaryGrantExpiry(body);

  if (!projectSlug) return res.status(400).json({ error: 'projectSlug is required' });
  if (!toolRule) return res.status(400).json({ error: 'toolRule is required' });
  if (secretLike(toolRule) || secretLike(reason ?? '') || secretLike(usageLimit ?? '')) {
    return res.status(400).json({ error: 'Temporary grants must not contain credential-like material' });
  }
  if (!expiresAt) return res.status(400).json({ error: 'expiresAt or durationHours must be greater than now and no more than 24 hours' });

  const { project, error: projectError } = await fetchProjectBySlug(projectSlug);
  if (projectError) return res.status(500).json({ error: projectError });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${projectSlug}"` });

  if (connectionId) {
    const belongs = await connectionBelongsToProject(connectionId, project.id);
    if (belongs.error) return res.status(500).json({ error: belongs.error });
    if (!belongs.ok) return res.status(404).json({ error: 'Connection not found for this project' });
  }

  const { data: grant, error } = await supabase
    .from('plugin_permission_grants')
    .insert({
      project_id: project.id,
      connection_id: connectionId,
      grant_type: grantType,
      tool_rule: toolRule,
      reason,
      requested_by: req.founder?.email ?? 'founder',
      usage_limit: usageLimit,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const grantRow = recordOrNull(grant);
  const grantId = stringOrNull(grantRow?.id);
  const { error: auditError } = await supabase.from('project_events').insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: 'plugin_permission_grant_created',
    severity: 'warning',
    screen: 'plugin-center-api',
    metadata: {
      route: 'POST /plugin-center/grants',
      requested_by: req.founder?.email,
      grantId,
      grantType,
      toolRule,
      expiresAt,
    },
  });

  if (auditError) {
    if (grantId) {
      await supabase
        .from('plugin_permission_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', grantId);
    }
    return res.status(500).json({ error: 'PLUGIN_GRANT_AUDIT_INCOMPLETE', detail: auditError.message });
  }

  return res.status(201).json({ grant });
});

pluginCenterRouter.post('/grants/:grantId/revoke', async (req: FounderRequest, res) => {
  const { grantId } = req.params;

  const { data: existing, error: readError } = await supabase
    .from('plugin_permission_grants')
    .select('id, project_id, revoked_at')
    .eq('id', grantId)
    .maybeSingle();

  if (readError) return res.status(500).json({ error: readError.message });
  const existingRow = recordOrNull(existing);
  if (!existingRow) return res.status(404).json({ error: 'Temporary grant not found' });

  const projectId = stringOrNull(existingRow.project_id);
  if (!projectId) return res.status(500).json({ error: 'Temporary grant is missing project_id' });

  const revokedAt = new Date().toISOString();
  const { data: grant, error } = await supabase
    .from('plugin_permission_grants')
    .update({ revoked_at: revokedAt })
    .eq('id', grantId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { error: auditError } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: randomUUID(),
    event_type: 'plugin_permission_grant_revoked',
    severity: 'info',
    screen: 'plugin-center-api',
    metadata: {
      route: `POST /plugin-center/grants/${grantId}/revoke`,
      revoked_by: req.founder?.email,
      grantId,
      revokedAt,
    },
  });

  if (auditError) return res.status(500).json({ error: 'PLUGIN_REVOKE_AUDIT_INCOMPLETE', detail: auditError.message });
  return res.json({ grant });
});
