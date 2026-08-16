import { Router, type Request } from 'express';
import {
  CONNECTION_VAULT_CONTRACT,
  hashFcrApiToken,
  issueFcrApiToken,
  normalizeSecretReference,
  normalizeTokenScopes,
  parseVaultEnvironment,
} from '../../connectionVault/tokens.js';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const connectionVaultRouter = Router();

type DbRecord = Record<string, unknown>;

const ENV_NAME = /^[A-Z][A-Z0-9_]{1,127}$/;
const MAX_TOKEN_LIFETIME_MINUTES = 24 * 60;
const RAW_CREDENTIAL_KEYS = new Set([
  'secret',
  'secretvalue',
  'token',
  'apikey',
  'api_key',
  'password',
  'credential',
  'credentialvalue',
  'privatekey',
  'private_key',
]);

function record(value: unknown): DbRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as DbRecord
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function bearerToken(req: Request): string | null {
  const authorization = req.get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

function hasRawCredentialField(body: DbRecord): boolean {
  return Object.entries(body).some(([key, value]) => {
    if (value === undefined || value === null || value === '') return false;
    return RAW_CREDENTIAL_KEYS.has(key.toLowerCase());
  });
}

function publicToken(row: DbRecord) {
  return {
    id: text(row.id),
    projectId: text(row.project_id),
    name: text(row.name),
    environment: text(row.environment),
    tokenPrefix: text(row.token_prefix),
    scopes: textArray(row.scopes),
    expiresAt: text(row.expires_at),
    revokedAt: text(row.revoked_at),
    rotatedAt: text(row.rotated_at),
    lastUsedAt: text(row.last_used_at),
    usageCount: Number(row.usage_count ?? 0),
    createdAt: text(row.created_at),
  };
}

function publicBinding(row: DbRecord) {
  const kind = text(row.kind);
  return {
    id: text(row.id),
    projectId: text(row.project_id),
    connectionId: text(row.connection_id),
    environment: text(row.environment),
    name: text(row.name),
    kind,
    storageProvider: text(row.storage_provider),
    configured: kind === 'secret' ? Boolean(text(row.secret_ref)) : true,
    value: kind === 'variable' ? text(row.variable_value) ?? '' : undefined,
    status: text(row.status),
    lastVerifiedAt: text(row.last_verified_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

async function projectBySlug(projectSlug: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name')
    .eq('slug', projectSlug)
    .maybeSingle();
  if (error) throw new Error(`project lookup failed: ${error.message}`);
  const row = record(data);
  if (!row || !text(row.id)) return null;
  return row;
}

async function connectionForProject(connectionId: string, projectId: string) {
  const { data, error } = await supabase
    .from('project_connections')
    .select('id, project_id, connection_type, label, status, authority_level, capabilities')
    .eq('id', connectionId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`connection lookup failed: ${error.message}`);
  return record(data);
}

async function activeToken(req: Request) {
  const raw = bearerToken(req);
  if (!raw || !raw.startsWith('fcr_')) return null;
  const tokenHash = hashFcrApiToken(raw);
  const { data, error } = await supabase
    .from('fcr_api_tokens')
    .select('id, project_id, name, environment, token_prefix, scopes, expires_at, revoked_at, usage_count')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw new Error(`token lookup failed: ${error.message}`);
  const row = record(data);
  if (!row || text(row.revoked_at)) return null;
  const expiresAt = Date.parse(text(row.expires_at) ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return row;
}

function scopeAllows(scopes: string[], required: string): boolean {
  if (scopes.includes(required) || scopes.includes('*')) return true;
  const [namespace] = required.split(':');
  return scopes.includes(`${namespace}:*`);
}

// Workflow-facing API. This endpoint intentionally returns only allowlisted
// connection metadata, non-secret variables, and configured-state for secrets.
// Raw provider credentials, secret references, and provider config never cross
// this boundary.
connectionVaultRouter.get('/resolve', async (req, res) => {
  try {
    const token = await activeToken(req);
    if (!token) return res.status(401).json({ error: 'invalid_or_expired_fcr_api_token' });

    const scopes = textArray(token.scopes);
    if (!scopeAllows(scopes, 'connections:resolve')) {
      return res.status(403).json({ error: 'fcr_api_token_scope_denied' });
    }

    const projectSlug = text(req.query.projectId);
    const capability = text(req.query.capability);
    if (!projectSlug || !capability) {
      return res.status(400).json({ error: 'projectId and capability are required' });
    }
    const environment = parseVaultEnvironment(req.query.environment);
    if (text(token.environment) !== environment) {
      return res.status(403).json({ error: 'fcr_api_token_environment_denied' });
    }

    const project = await projectBySlug(projectSlug);
    if (!project) return res.status(404).json({ error: 'project_not_registered' });
    const projectId = text(project.id)!;
    if (text(token.project_id) !== projectId) {
      return res.status(403).json({ error: 'fcr_api_token_project_denied' });
    }

    const { data: connectionRows, error: connectionError } = await supabase
      .from('project_connections')
      .select('id, connection_type, label, status, authority_level, capabilities, data_boundary, required_approval')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .contains('capabilities', [capability]);
    if (connectionError) throw new Error(`connection resolution failed: ${connectionError.message}`);

    const connections = (connectionRows ?? []).map((entry) => record(entry)).filter(Boolean) as DbRecord[];
    const connectionIds = connections.map((entry) => text(entry.id)).filter((value): value is string => Boolean(value));

    let bindingRows: DbRecord[] = [];
    if (connectionIds.length > 0) {
      const { data, error } = await supabase
        .from('connection_vault_bindings')
        .select('id, project_id, connection_id, environment, name, kind, storage_provider, secret_ref, variable_value, status, last_verified_at, created_at, updated_at')
        .in('connection_id', connectionIds)
        .eq('environment', environment)
        .eq('status', 'active');
      if (error) throw new Error(`binding resolution failed: ${error.message}`);
      bindingRows = (data ?? []).map((entry) => record(entry)).filter(Boolean) as DbRecord[];
    }

    const publicBindings = bindingRows.map(publicBinding);
    const resolved = connections.map((connection) => ({
      id: text(connection.id),
      type: text(connection.connection_type),
      label: text(connection.label),
      authorityLevel: text(connection.authority_level),
      capabilities: textArray(connection.capabilities),
      dataBoundary: text(connection.data_boundary),
      requiredApproval: text(connection.required_approval),
      bindings: publicBindings.filter((binding) => binding.connectionId === text(connection.id)),
    }));

    const { error: usageError } = await supabase.rpc('record_fcr_api_token_usage', {
      p_token_id: text(token.id),
      p_project_id: projectId,
      p_route: '/mcp/vault/resolve',
      p_method: 'GET',
      p_capability: capability,
      p_status_code: 200,
      p_connection_count: resolved.length,
    });
    if (usageError) throw new Error(`token usage evidence failed: ${usageError.message}`);

    return res.json({
      contract: CONNECTION_VAULT_CONTRACT,
      project: { id: projectId, slug: text(project.slug), name: text(project.name) },
      environment,
      capability,
      credentialBoundary: {
        rawCredentialsReturned: false,
        secretReferencesReturned: false,
        secretResolution: 'fcr-internal-only',
      },
      connections: resolved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }
});

// Everything below is founder administration. These routes live on the
// existing same-origin founder API surface and never accept raw secret values.
connectionVaultRouter.use(requireFounder);

connectionVaultRouter.get('/', async (_req: FounderRequest, res) => {
  const { data: bindingRows, error: bindingError } = await supabase
    .from('connection_vault_bindings')
    .select('id, project_id, connection_id, environment, name, kind, storage_provider, secret_ref, variable_value, status, last_verified_at, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (bindingError) return res.status(500).json({ error: bindingError.message });

  const { data: tokenRows, error: tokenError } = await supabase
    .from('fcr_api_tokens')
    .select('id, project_id, name, environment, token_prefix, scopes, expires_at, revoked_at, rotated_at, last_used_at, usage_count, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (tokenError) return res.status(500).json({ error: tokenError.message });

  return res.json({
    contract: CONNECTION_VAULT_CONTRACT,
    secretStoragePolicy: 'external-reference-only',
    bindings: (bindingRows ?? []).map((entry) => publicBinding(entry as DbRecord)),
    apiTokens: (tokenRows ?? []).map((entry) => publicToken(entry as DbRecord)),
  });
});

connectionVaultRouter.post('/bindings', async (req: FounderRequest, res) => {
  try {
    const body = record(req.body) ?? {};
    if (hasRawCredentialField(body)) {
      return res.status(400).json({ error: 'raw credential values are not accepted; supply secretRef only' });
    }

    const projectSlug = text(body.projectSlug);
    const connectionId = text(body.connectionId);
    const name = text(body.name);
    const kind = text(body.kind);
    const storageProvider = text(body.storageProvider);
    const secretRefInput = text(body.secretRef);
    const variableValue = typeof body.variableValue === 'string' ? body.variableValue : null;
    if (!projectSlug || !connectionId || !name || !kind || !storageProvider) {
      return res.status(400).json({ error: 'projectSlug, connectionId, name, kind, and storageProvider are required' });
    }
    if (!ENV_NAME.test(name)) return res.status(400).json({ error: 'name must use ENV_VARIABLE_STYLE' });
    const environment = parseVaultEnvironment(body.environment);
    if (kind !== 'secret' && kind !== 'variable') return res.status(400).json({ error: 'kind must be secret or variable' });
    if (kind === 'secret' && (!secretRefInput || variableValue !== null)) {
      return res.status(400).json({ error: 'secret bindings require secretRef and never accept variableValue' });
    }
    if (kind === 'variable' && (variableValue === null || secretRefInput)) {
      return res.status(400).json({ error: 'variable bindings require variableValue and must not include secretRef' });
    }
    if (/(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|API_KEY)/i.test(name) && kind !== 'secret') {
      return res.status(400).json({ error: 'secret-like environment names must use kind=secret' });
    }
    const secretRef = kind === 'secret' ? normalizeSecretReference(secretRefInput) : null;

    const project = await projectBySlug(projectSlug);
    if (!project) return res.status(404).json({ error: 'project_not_registered' });
    const projectId = text(project.id)!;
    const connection = await connectionForProject(connectionId, projectId);
    if (!connection) return res.status(404).json({ error: 'connection_not_registered_for_project' });

    const { data, error } = await supabase
      .from('connection_vault_bindings')
      .upsert({
        project_id: projectId,
        connection_id: connectionId,
        environment,
        name,
        kind,
        storage_provider: storageProvider,
        secret_ref: secretRef,
        variable_value: kind === 'variable' ? variableValue : null,
        status: 'active',
        created_by: req.founder?.email ?? 'founder',
      }, { onConflict: 'connection_id,environment,name' })
      .select('id, project_id, connection_id, environment, name, kind, storage_provider, secret_ref, variable_value, status, last_verified_at, created_at, updated_at')
      .single();
    if (error) throw new Error(`binding write failed: ${error.message}`);

    return res.status(201).json({ binding: publicBinding(data as DbRecord) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }
});

connectionVaultRouter.post('/tokens', async (req: FounderRequest, res) => {
  try {
    const body = record(req.body) ?? {};
    if (hasRawCredentialField(body)) return res.status(400).json({ error: 'credential material is not accepted in token metadata' });
    const projectSlug = text(body.projectSlug);
    const name = text(body.name);
    if (!projectSlug || !name) return res.status(400).json({ error: 'projectSlug and name are required' });
    const environment = parseVaultEnvironment(body.environment);
    const scopes = normalizeTokenScopes(body.scopes);
    const expiresInMinutes = body.expiresInMinutes === undefined ? 60 : Number(body.expiresInMinutes);
    if (!Number.isFinite(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > MAX_TOKEN_LIFETIME_MINUTES) {
      return res.status(400).json({ error: `expiresInMinutes must be between 1 and ${MAX_TOKEN_LIFETIME_MINUTES}` });
    }

    const project = await projectBySlug(projectSlug);
    if (!project) return res.status(404).json({ error: 'project_not_registered' });
    const issued = issueFcrApiToken(environment);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('fcr_api_tokens')
      .insert({
        project_id: text(project.id),
        name: name.slice(0, 160),
        environment,
        token_prefix: issued.tokenPrefix,
        token_hash: issued.tokenHash,
        scopes,
        expires_at: expiresAt,
        created_by: req.founder?.email ?? 'founder',
      })
      .select('id, project_id, name, environment, token_prefix, scopes, expires_at, revoked_at, rotated_at, last_used_at, usage_count, created_at')
      .single();
    if (error) throw new Error(`token issue failed: ${error.message}`);

    return res.status(201).json({
      token: issued.token,
      shownOnce: true,
      tokenMetadata: publicToken(data as DbRecord),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }
});

connectionVaultRouter.post('/tokens/:tokenId/rotate', async (req: FounderRequest, res) => {
  try {
    const { data: existing, error: readError } = await supabase
      .from('fcr_api_tokens')
      .select('id, project_id, name, environment, scopes, expires_at, revoked_at')
      .eq('id', req.params.tokenId)
      .maybeSingle();
    if (readError) throw new Error(`token read failed: ${readError.message}`);
    const row = record(existing);
    if (!row) return res.status(404).json({ error: 'token_not_found' });
    if (text(row.revoked_at)) return res.status(409).json({ error: 'revoked_token_cannot_be_rotated' });

    const environment = parseVaultEnvironment(row.environment);
    const issued = issueFcrApiToken(environment);
    const { data, error } = await supabase
      .from('fcr_api_tokens')
      .update({
        token_prefix: issued.tokenPrefix,
        token_hash: issued.tokenHash,
        rotated_at: new Date().toISOString(),
        last_used_at: null,
        usage_count: 0,
      })
      .eq('id', req.params.tokenId)
      .select('id, project_id, name, environment, token_prefix, scopes, expires_at, revoked_at, rotated_at, last_used_at, usage_count, created_at')
      .single();
    if (error) throw new Error(`token rotation failed: ${error.message}`);

    return res.json({
      token: issued.token,
      shownOnce: true,
      tokenMetadata: publicToken(data as DbRecord),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }
});

connectionVaultRouter.post('/tokens/:tokenId/revoke', async (req: FounderRequest, res) => {
  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('fcr_api_tokens')
    .update({ revoked_at: revokedAt })
    .eq('id', req.params.tokenId)
    .is('revoked_at', null)
    .select('id, project_id, name, environment, token_prefix, scopes, expires_at, revoked_at, rotated_at, last_used_at, usage_count, created_at')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'active_token_not_found' });
  return res.json({ tokenMetadata: publicToken(data as DbRecord) });
});
