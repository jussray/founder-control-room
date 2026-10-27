/**
 * Public-customer MCP is separate from FCR's founder-only /mcp route.
 * Disabled by default until OAuth consent, tenant schema, CI, and runtime
 * evidence have independently passed their release gates.
 */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { authenticatePublicMcp, FCR_PUBLIC_MCP_RESOURCE } from '../../mcp/publicMcpAuth.js';
import {
  PublicMcpAccessDenied,
  getMyPublicProject,
  listMyPublicProjects,
  type PublicMcpTenantReader,
  type PublicProjectSummary,
} from '../../mcp/publicTenantAccess.js';

const RESOURCE = FCR_PUBLIC_MCP_RESOURCE;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_SCHEME = [{ type: 'oauth2', scopes: ['openid'] }];
const publicMcpTools = [
  {
    name: 'fcr_list_my_projects',
    title: 'List my connected FCR projects',
    description: 'List only sanitized projects of tenants that granted the authenticated user active membership.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: READ_SCHEME,
  },
  {
    name: 'fcr_get_my_project',
    title: 'Read my FCR project summary',
    description: 'Read a sanitized public project summary within an authenticated tenant membership.',
    inputSchema: {
      type: 'object', required: ['projectId'], additionalProperties: false,
      properties: { projectId: { type: 'string', format: 'uuid' } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: READ_SCHEME,
  },
] as const;

const jsonRpc = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: '2.0', id, error: { code, message },
});

// Deliberately does NOT read the founder projects table or execute providers.
const tenantReader: PublicMcpTenantReader = {
  async listMemberships(userId) {
    const { data, error } = await supabase.from('fcr_public_memberships')
      .select('tenant_id,user_id,status')
      .eq('user_id', userId).eq('status', 'active').limit(21);
    if (error) throw new Error('public_mcp_membership_read_unavailable');
    return (data ?? []).map((row) => ({
      tenantId: row.tenant_id, userId: row.user_id, status: row.status,
    }));
  },
  async listProjects(tenantId) {
    const { data, error } = await supabase.from('fcr_public_projects')
      .select('id,tenant_id,name,status,observed_at')
      .eq('tenant_id', tenantId).order('id').limit(51);
    if (error) throw new Error('public_mcp_projects_read_unavailable');
    return (data ?? []).map((row): PublicProjectSummary => ({
      id: row.id, tenantId: row.tenant_id, name: row.name,
      status: row.status, observedAt: row.observed_at,
    }));
  },
  async getProject(tenantId, projectId) {
    const { data, error } = await supabase.from('fcr_public_projects')
      .select('id,tenant_id,name,status,observed_at')
      .eq('tenant_id', tenantId).eq('id', projectId).maybeSingle();
    if (error) throw new Error('public_mcp_project_read_unavailable');
    return data ? {
      id: data.id, tenantId: data.tenant_id, name: data.name,
      status: data.status, observedAt: data.observed_at,
    } : null;
  },
};

export const publicMcpRouter = Router();
const publicMcpRateLimit = rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
});

function resourceMetadata(_req: unknown, res: import('express').Response) {
  res.set('Cache-Control', 'no-store');
  const issuer = process.env.SUPABASE_URL?.replace(/\/$/, '') + '/auth/v1';
  if (!process.env.SUPABASE_URL) return res.status(503).json({ error: 'OAuth not configured' });
  return res.json({
    resource: RESOURCE, authorization_servers: [issuer],
    scopes_supported: ['openid'], bearer_methods_supported: ['header'],
    resource_name: 'Founder Control Room public MCP',
  });
}

publicMcpRouter.get('/.well-known/oauth-protected-resource/mcp/public', resourceMetadata);
publicMcpRouter.post('/mcp/public', publicMcpRateLimit, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (process.env.FCR_PUBLIC_MCP_ENABLED !== 'true') {
    return res.status(503).json(rpcError(null, -32000, 'Public MCP is not activated'));
  }
  if (!req.is('application/json')) return res.status(415).json(rpcError(null, -32600, 'JSON required'));
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json(rpcError(null, -32600, 'Invalid request'));
  }
  const id = typeof req.body.id === 'string' || typeof req.body.id === 'number' ? req.body.id : null;
  const token = /^Bearer (\S+)$/.exec(req.header('authorization') ?? '')?.[1];
  if (!token) {
    res.set('WWW-Authenticate', `Bearer resource_metadata="${RESOURCE.replace('/mcp/public', '/.well-known/oauth-protected-resource/mcp/public')}"`);
    return res.status(401).json(rpcError(id, -32000, 'Authentication required'));
  }
  const issuer = `${process.env.SUPABASE_URL?.replace(/\/$/, '') || ''}/auth/v1`;
  const clientIds = (process.env.FCR_PUBLIC_MCP_OAUTH_CLIENT_IDS ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const user = await authenticatePublicMcp(token, { issuer, allowedClientIds: clientIds }, async bearer => {
    const { data, error } = await supabaseAuth.auth.getUser(bearer);
    return error || !data?.user ? null : { id: data.user.id, is_anonymous: data.user.is_anonymous };
  });
  if (!user) {
    res.set('WWW-Authenticate', `Bearer resource_metadata="${RESOURCE.replace('/mcp/public', '/.well-known/oauth-protected-resource/mcp/public')}", error="invalid_token"`);
    return res.status(401).json(rpcError(id, -32000, 'Authentication required'));
  }
  const method = req.body.method;
  if (method === 'initialize') {
    return res.json(jsonRpc(id, {
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'founder-control-room-public', version: '0.1.0' },
      instructions: 'Read only sanitized projects belonging to this authenticated user. No founder portfolio or external actions.',
    }));
  }
  if (method === 'ping') return res.json(jsonRpc(id, {}));
  if (method === 'tools/list') return res.json(jsonRpc(id, { tools: publicMcpTools }));
  if (method !== 'tools/call') return res.status(404).json(rpcError(id, -32601, 'Method not found'));
  const name = req.body.params?.name;
  const args = req.body.params?.arguments ?? {};
  if (!args || Array.isArray(args) || typeof args !== 'object') {
    return res.status(400).json(rpcError(id, -32602, 'Invalid arguments'));
  }
  try {
    let output: unknown;
    if (name === 'fcr_list_my_projects' && Object.keys(args).length === 0) {
      output = await listMyPublicProjects(user, tenantReader);
    } else if (name === 'fcr_get_my_project' && Object.keys(args).length === 1 && UUID.test(args.projectId)) {
      output = await getMyPublicProject(user, tenantReader, args.projectId);
    } else {
      return res.status(400).json(rpcError(id, -32602, 'Unknown tool or invalid arguments'));
    }
    return res.json(jsonRpc(id, {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output, isError: false,
    }));
  } catch (error) {
    if (error instanceof PublicMcpAccessDenied) {
      return res.status(404).json(rpcError(id, -32004, 'Resource not found or not available'));
    }
    // Internal/provider failures are never turned into empty lists or success.
    return res.status(503).json(rpcError(id, -32000, 'Public MCP data is unavailable'));
  }
});
