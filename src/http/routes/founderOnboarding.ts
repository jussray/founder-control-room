import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabase } from '../../lib/supabaseClient.js';
import {
  PLUGIN_CATALOG,
  pluginDescriptorFor,
  type PluginDescriptor,
} from '../../lib/pluginCenter.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const founderOnboardingRouter = Router();
founderOnboardingRouter.use(requireFounder);

type DbRecord = Record<string, unknown>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECOMMENDED_PROVIDER_TYPES = [
  'github',
  'cloudflare',
  'supabase',
  'openai',
  'hubspot',
  'playwright',
] as const;
const RECOMMENDED_PROVIDER_SET = new Set<string>(RECOMMENDED_PROVIDER_TYPES);

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized.length > 0 ? normalized : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function recommendedCatalog() {
  return RECOMMENDED_PROVIDER_TYPES.map((type) => pluginDescriptorFor(type))
    .filter((plugin): plugin is PluginDescriptor => Boolean(plugin))
    .map((plugin) => ({
      type: plugin.type,
      label: plugin.label,
      description: plugin.description,
      authorityLevel: plugin.defaultAuthorityLevel,
      dataBoundary: plugin.defaultDataBoundary,
      capabilities: plugin.capabilities.map((capability) => ({
        id: capability.id,
        label: capability.label,
        risk: capability.risk,
        separateFounderGate: capability.separateFounderGate,
      })),
      blockedByDefault: [...plugin.blockedByDefault],
    }));
}

founderOnboardingRouter.get('/state', async (_req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');

  const { data: projectRows, error: projectsError } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier, stack, status, risk_level, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (projectsError) return res.status(500).json({ error: projectsError.message });

  const projects = (projectRows ?? []) as DbRecord[];
  const projectIds = projects
    .map((project) => optionalString(project.id))
    .filter((id): id is string => Boolean(id));

  let connectionRows: DbRecord[] = [];
  if (projectIds.length > 0) {
    const { data, error } = await supabase
      .from('project_connections')
      .select('id, project_id, connection_type, label, status, authority_level, capabilities, data_boundary, required_approval, last_checked_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    connectionRows = (data ?? []) as DbRecord[];
  }

  const connectionsByProject = new Map<string, DbRecord[]>();
  for (const connection of connectionRows) {
    const projectId = optionalString(connection.project_id);
    if (!projectId) continue;
    const current = connectionsByProject.get(projectId) ?? [];
    current.push(connection);
    connectionsByProject.set(projectId, current);
  }

  const normalizedProjects = projects.map((project) => {
    const projectId = optionalString(project.id) ?? '';
    return {
      id: projectId,
      slug: optionalString(project.slug),
      name: optionalString(project.name),
      repoProvider: optionalString(project.repo_provider),
      repoIdentifier: optionalString(project.repo_identifier),
      stack: optionalString(project.stack),
      status: optionalString(project.status),
      riskLevel: optionalString(project.risk_level),
      connections: (connectionsByProject.get(projectId) ?? []).map((connection) => ({
        id: optionalString(connection.id),
        type: optionalString(connection.connection_type),
        label: optionalString(connection.label),
        status: optionalString(connection.status),
        authorityLevel: optionalString(connection.authority_level),
        capabilities: stringArray(connection.capabilities),
        dataBoundary: optionalString(connection.data_boundary),
        requiredApproval: optionalString(connection.required_approval),
        lastCheckedAt: optionalString(connection.last_checked_at),
      })),
    };
  });

  return res.json({
    complete: normalizedProjects.length > 0,
    projects: normalizedProjects,
    recommendedProviders: recommendedCatalog(),
    authorityBoundary: {
      loginGrantsExecution: false,
      mergeRequiresSeparateApproval: true,
      deployRequiresSeparateApproval: true,
      productionMutationRequiresSeparateApproval: true,
      connectionSlotsStoreCredentials: false,
    },
  });
});

founderOnboardingRouter.post('/bootstrap', async (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');

  const body = req.body as DbRecord;
  const projectInput = body.project && typeof body.project === 'object'
    ? body.project as DbRecord
    : {};

  const slug = stringValue(projectInput.slug);
  const name = stringValue(projectInput.name);
  const repoProvider = optionalString(projectInput.repoProvider) ?? 'github';
  const repoIdentifier = optionalString(projectInput.repoIdentifier);
  const stack = optionalString(projectInput.stack);
  const riskLevel = optionalString(projectInput.riskLevel) ?? 'medium';
  const requestedProviders = [...new Set(stringArray(body.providers))];

  if (!slug || !name) {
    return res.status(400).json({ error: 'project.slug and project.name are required' });
  }
  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({
      error: 'project.slug must be lowercase alphanumeric segments separated by hyphens',
    });
  }
  if (!['low', 'medium', 'high'].includes(riskLevel)) {
    return res.status(400).json({ error: 'project.riskLevel must be low, medium, or high' });
  }
  if (requestedProviders.some((provider) => !RECOMMENDED_PROVIDER_SET.has(provider))) {
    return res.status(400).json({
      error: `providers must be drawn from: ${RECOMMENDED_PROVIDER_TYPES.join(', ')}`,
    });
  }

  const { data: existingProject, error: existingProjectError } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier, stack, status, risk_level')
    .eq('slug', slug)
    .maybeSingle();

  if (existingProjectError) {
    return res.status(500).json({ error: existingProjectError.message });
  }

  let project = existingProject as DbRecord | null;
  let projectCreated = false;

  if (!project) {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        slug,
        name,
        repo_provider: repoProvider,
        repo_identifier: repoIdentifier,
        stack,
        status: 'active',
        risk_level: riskLevel,
      })
      .select('id, slug, name, repo_provider, repo_identifier, stack, status, risk_level')
      .single();

    if (error || !data) {
      return res.status(500).json({ error: error?.message ?? 'Project creation returned no record' });
    }

    project = data as DbRecord;
    projectCreated = true;
  }

  const projectId = optionalString(project.id);
  if (!projectId) {
    return res.status(500).json({ error: 'Project record is missing its identifier' });
  }

  const { data: existingConnections, error: existingConnectionsError } = await supabase
    .from('project_connections')
    .select('connection_type, label')
    .eq('project_id', projectId);

  if (existingConnectionsError) {
    return res.status(500).json({ error: existingConnectionsError.message });
  }

  const existingTypes = new Set(
    ((existingConnections ?? []) as DbRecord[])
      .filter((connection) => optionalString(connection.label) === 'primary')
      .map((connection) => optionalString(connection.connection_type))
      .filter((type): type is string => Boolean(type)),
  );

  const rows = requestedProviders
    .filter((provider) => !existingTypes.has(provider))
    .map((provider) => {
      const descriptor = pluginDescriptorFor(provider);
      if (!descriptor) return null;
      return {
        project_id: projectId,
        connection_type: descriptor.type,
        label: 'primary',
        config: {
          onboarding: true,
          setup_state: 'declared',
        },
        secret_ref: null,
        status: 'disconnected',
        authority_level: descriptor.defaultAuthorityLevel,
        capabilities: descriptor.capabilities.map((capability) => capability.id),
        data_boundary: descriptor.defaultDataBoundary,
        required_approval: descriptor.capabilities.some(
          (capability) => capability.separateFounderGate,
        )
          ? 'founder-per-action'
          : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  let createdConnections: DbRecord[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('project_connections')
      .insert(rows)
      .select('id, connection_type, label, status, authority_level, capabilities, data_boundary, required_approval');

    if (error) return res.status(500).json({ error: error.message });
    createdConnections = (data ?? []) as DbRecord[];
  }

  const { error: eventError } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: randomUUID(),
    event_type: 'founder_onboarding_bootstrapped',
    severity: 'info',
    screen: 'founder-onboarding',
    metadata: {
      route: 'POST /onboarding/bootstrap',
      founder: req.founder?.email,
      projectCreated,
      requestedProviders,
      createdProviders: createdConnections.map((connection) => connection.connection_type),
      authorityGranted: false,
      credentialsStored: false,
    },
  });

  if (eventError) {
    return res.status(500).json({
      error: 'Workspace was created, but its onboarding audit event could not be recorded',
      detail: eventError.message,
    });
  }

  return res.status(projectCreated ? 201 : 200).json({
    ok: true,
    project,
    projectCreated,
    connectionsCreated: createdConnections,
    connectionsAlreadyPresent: requestedProviders.filter((provider) => existingTypes.has(provider)),
    next: {
      launch: '/control-room/',
      githubWorkspace: '/control-room/github-workspace.html',
      commandBridge: '/control-room/command-bridge.html',
      pluginCenter: '/control-room/plugin-center.html',
    },
    truth: {
      credentialsStored: false,
      providersConnected: false,
      mergeApproved: false,
      deploymentApproved: false,
    },
  });
});

// Keep the catalog imported and type-checked as the single provider source.
void PLUGIN_CATALOG;
