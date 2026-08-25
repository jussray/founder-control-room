import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response as ExpressResponse } from 'express';
import { supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { assertNoSecretArguments } from '../../mcp/safety.js';
import {
  createExternalMcpToolExecutor,
  externalMcpToolDefinitions,
  isExternalMcpToolName,
  type ExternalMcpIdentity,
  type ExternalMcpToolDependencies,
} from '../../mcp/externalTools.js';

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
const SUPPORTED_PROTOCOL_VERSIONS = [
  MODERN_PROTOCOL_VERSION,
  ...LEGACY_PROTOCOL_VERSIONS,
] as const;
const SERVER_NAME = 'founder-control-room-paired';
const SERVER_VERSION = '0.2.0';
const DEFAULT_RESOURCE = 'https://api.foundercontrolroom.org/mcp';
const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const MAX_BODY_BYTES = 64 * 1024;
const PROTOCOL_META = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_CAPABILITIES_META = 'io.modelcontextprotocol/clientCapabilities';
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo';

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number | null;

export interface RemoteMcpOauthIdentity extends ExternalMcpIdentity {
  projectIds: string[];
}

export interface RemoteReadMcpDependencies extends ExternalMcpToolDependencies {
  authMode?: 'oauth' | 'static';
  authenticateOauth?: (
    token: string,
    env: NodeJS.ProcessEnv,
  ) => Promise<RemoteMcpOauthIdentity>;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcId(value: unknown): JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRecord {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRecord {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function boundedString(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return boundedString(authorization.slice('Bearer '.length), 8192);
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function commaList(value: string | undefined): string[] {
  return [...new Set((value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function configuredProjectScope(env: NodeJS.ProcessEnv): Set<string> {
  const projects = commaList(env.FCR_REMOTE_MCP_READ_PROJECTS);
  if (projects.length === 0 || projects.some((project) => !PROJECT_SLUG.test(project))) {
    return new Set();
  }
  return new Set(projects);
}

function configuredResource(env: NodeJS.ProcessEnv): URL {
  const url = new URL(env.FCR_REMOTE_MCP_RESOURCE?.trim() || DEFAULT_RESOURCE);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('FCR_REMOTE_MCP_RESOURCE must be a canonical https URL');
  }
  return url;
}

function authorizationIssuer(env: NodeJS.ProcessEnv): string | null {
  const configured = env.FCR_REMOTE_MCP_OAUTH_ISSUER?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const supabaseUrl = env.SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
}

function resourceMetadataUrl(env: NodeJS.ProcessEnv): string {
  const resource = configuredResource(env);
  const suffix = resource.pathname === '/' ? '' : resource.pathname;
  return `${resource.origin}/.well-known/oauth-protected-resource${suffix}`;
}

function applyMcpHeaders(res: ExpressResponse): void {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function challenge(res: ExpressResponse, env: NodeJS.ProcessEnv, detail?: {
  error?: string;
  scope?: string;
  description?: string;
}): void {
  const parameters = [
    `resource_metadata="${resourceMetadataUrl(env)}"`,
    ...(detail?.error ? [`error="${detail.error}"`] : []),
    ...(detail?.scope ? [`scope="${detail.scope}"`] : []),
    ...(detail?.description ? [`error_description="${detail.description.replace(/["\\]/g, '')}"`] : []),
  ];
  res.setHeader('WWW-Authenticate', `Bearer ${parameters.join(', ')}`);
}

function decodeJwtPayload(token: string): JsonRecord {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('OAuth access token must be a JWT');
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('OAuth access token payload is malformed');
  }
  if (!isRecord(value)) throw new Error('OAuth access token claims are malformed');
  return value;
}

function claimAudience(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  return [];
}

function claimScopes(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  return [];
}

function claimProjects(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return [];
  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => PROJECT_SLUG.test(entry)))];
}

export async function verifyRemoteMcpOauthToken(
  token: string,
  env: NodeJS.ProcessEnv,
): Promise<RemoteMcpOauthIdentity> {
  const issuer = authorizationIssuer(env);
  const audience = env.FCR_REMOTE_MCP_OAUTH_AUDIENCE?.trim();
  const allowedClients = new Set(commaList(env.FCR_REMOTE_MCP_OAUTH_CLIENT_IDS));
  const requiredScope = env.FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE?.trim() || 'mcp:read';
  if (!issuer || !audience || allowedClients.size === 0) {
    throw new Error('OAuth issuer, audience, or client allowlist is not configured');
  }

  const claims = decodeJwtPayload(token);
  const now = Math.floor(Date.now() / 1000);
  const clientId = boundedString(claims.client_id, 500);
  const subject = boundedString(claims.sub, 500);
  if (claims.iss !== issuer) throw new Error('OAuth issuer is not allowed');
  if (!claimAudience(claims.aud).includes(audience)) throw new Error('OAuth audience is not allowed');
  if (!clientId || !allowedClients.has(clientId)) throw new Error('OAuth client is not allowed');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('OAuth access token is expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) throw new Error('OAuth access token is not active');
  if (!claimScopes(claims.scope).includes(requiredScope)) throw new Error('OAuth scope is insufficient');

  const projectIds = claimProjects(claims.mcp_projects);
  if (projectIds.length === 0) throw new Error('OAuth access token has no MCP project grant');

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  const user = userData?.user;
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const userId = typeof user?.id === 'string' ? user.id.trim() : '';
  if (userError || !email || !userId || !subject || subject !== userId) {
    throw new Error('OAuth access token is invalid or revoked');
  }

  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (allowError) throw new Error('Founder allowlist check failed');
  if (!allowRow) throw new Error('OAuth identity is not on the founder allowlist');

  return { userId, email, clientId, projectIds, authMode: 'oauth' };
}

function intersectProjects(
  serverProjects: ReadonlySet<string>,
  tokenProjects: readonly string[],
): Set<string> {
  return new Set(tokenProjects.filter((project) => serverProjects.has(project)));
}

function sameOriginAllowed(req: Request, env: NodeJS.ProcessEnv): boolean {
  const origin = req.header('origin');
  if (!origin) return true;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  const allowed = new Set([
    configuredResource(env).origin,
    ...commaList(env.FCR_REMOTE_MCP_ALLOWED_ORIGINS).flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    }),
  ]);
  return allowed.has(normalized);
}

function requestBodySize(body: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return MAX_BODY_BYTES + 1;
  }
}

function requestMeta(body: JsonRecord): JsonRecord | null {
  const params = isRecord(body.params) ? body.params : null;
  return params && isRecord(params._meta) ? params._meta : null;
}

function decodeHeaderValue(value: string): string {
  if (!value.startsWith('=?base64?') || !value.endsWith('?=')) return value;
  try {
    return Buffer.from(value.slice('=?base64?'.length, -2), 'base64').toString('utf8');
  } catch {
    throw new Error('Mcp-Name header uses invalid base64 encoding');
  }
}

function validateModernRequest(req: Request, body: JsonRecord): JsonRecord | null {
  const id = rpcId(body.id);
  const meta = requestMeta(body);
  const headerVersion = req.header('mcp-protocol-version');
  const bodyVersion = meta?.[PROTOCOL_META];
  if (headerVersion !== MODERN_PROTOCOL_VERSION || bodyVersion !== MODERN_PROTOCOL_VERSION) {
    return rpcError(id, -32020, 'Header mismatch: MCP protocol version is missing or inconsistent');
  }
  if (!isRecord(meta?.[CLIENT_CAPABILITIES_META])) {
    return rpcError(id, -32600, 'Modern MCP requests require client capabilities in _meta');
  }
  if (req.header('mcp-method') !== body.method) {
    return rpcError(id, -32020, 'Header mismatch: Mcp-Method does not match the request body');
  }
  if (body.method === 'tools/call') {
    const params = isRecord(body.params) ? body.params : null;
    const bodyName = boundedString(params?.name, 160);
    const headerName = req.header('mcp-name');
    if (!bodyName || !headerName || decodeHeaderValue(headerName) !== bodyName) {
      return rpcError(id, -32020, 'Header mismatch: Mcp-Name does not match the request body');
    }
  }
  return null;
}

function modernResult(value: JsonRecord, cache?: { ttlMs: number; cacheScope: 'public' | 'private' }) {
  return {
    resultType: 'complete',
    ...value,
    ...(cache ?? {}),
    _meta: {
      ...(isRecord(value._meta) ? value._meta : {}),
      [SERVER_INFO_META]: { name: SERVER_NAME, version: SERVER_VERSION },
    },
  };
}

function toolResult(value: unknown, modern: boolean) {
  const base: JsonRecord = {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
  return modern ? modernResult(base) : base;
}

function protocolForRequest(req: Request, body: JsonRecord): string | null {
  const metaVersion = requestMeta(body)?.[PROTOCOL_META];
  if (typeof metaVersion === 'string') return metaVersion;
  const headerVersion = req.header('mcp-protocol-version');
  if (headerVersion) return headerVersion;
  if (body.method === 'initialize') {
    const params = isRecord(body.params) ? body.params : null;
    return typeof params?.protocolVersion === 'string' ? params.protocolVersion : null;
  }
  return null;
}

function supportedLegacyVersion(requested: unknown): string {
  return typeof requested === 'string'
    && (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LEGACY_PROTOCOL_VERSIONS[0];
}

function toolFailure(error: unknown): { status: number; code: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/outside this remote MCP grant/i.test(message)) return { status: 403, code: -32000, message };
  if (/blocked|denied|allowlist|not enabled|non-read/i.test(message)) {
    return { status: 403, code: -32000, message };
  }
  if (/evidence_persistence_unavailable/i.test(message)) {
    return { status: 503, code: -32000, message };
  }
  return { status: 400, code: -32602, message };
}

export function createRemoteReadMcpHandler(
  overrides: RemoteReadMcpDependencies = {},
): RequestHandler {
  const env = overrides.env ?? process.env;
  const authMode = overrides.authMode ?? 'static';
  const authenticateOauth = overrides.authenticateOauth ?? verifyRemoteMcpOauthToken;
  const executeTool = createExternalMcpToolExecutor({ ...overrides, env });

  return async (req: Request, res: ExpressResponse): Promise<void> => {
    applyMcpHeaders(res);

    try {
      configuredResource(env);
    } catch (error) {
      res.status(503).json(rpcError(null, -32000, error instanceof Error ? error.message : String(error)));
      return;
    }

    if (!sameOriginAllowed(req, env)) {
      res.status(403).json(rpcError(null, -32000, 'Origin not allowed'));
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      res.setHeader('Allow', 'POST');
      res.status(405).send();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).send();
      return;
    }

    const contentType = req.header('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      res.status(415).json(rpcError(null, -32600, 'Content-Type must be application/json'));
      return;
    }
    if (requestBodySize(req.body) > MAX_BODY_BYTES) {
      res.status(413).json(rpcError(null, -32600, 'MCP request exceeds the 64 KiB limit'));
      return;
    }

    const serverProjects = configuredProjectScope(env);
    if (serverProjects.size === 0) {
      res.status(503).json(rpcError(null, -32000, 'Remote MCP project scope is not configured'));
      return;
    }

    const token = bearerToken(req);
    if (!token) {
      challenge(res, env);
      res.status(401).json(rpcError(null, -32000, 'Unauthorized'));
      return;
    }

    let identity: ExternalMcpIdentity;
    let allowedProjects = serverProjects;
    if (authMode === 'oauth') {
      try {
        const oauthIdentity = await authenticateOauth(token, env);
        allowedProjects = intersectProjects(serverProjects, oauthIdentity.projectIds);
        if (allowedProjects.size === 0) throw new Error('OAuth project grant does not overlap server scope');
        identity = oauthIdentity;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OAuth access token is invalid';
        const insufficientScope = /scope|project grant/i.test(message);
        challenge(res, env, insufficientScope ? {
          error: 'insufficient_scope',
          scope: env.FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE?.trim() || 'mcp:read',
          description: message,
        } : { error: 'invalid_token', description: message });
        res.status(insufficientScope ? 403 : 401).json(rpcError(null, -32000, message));
        return;
      }
    } else {
      const configuredToken = env.FCR_REMOTE_MCP_READ_TOKEN?.trim();
      if (!configuredToken) {
        res.status(503).json(rpcError(null, -32000, 'Remote MCP static token is not configured'));
        return;
      }
      if (!secureEqual(token, configuredToken)) {
        challenge(res, env, { error: 'invalid_token' });
        res.status(401).json(rpcError(null, -32000, 'Unauthorized'));
        return;
      }
      identity = {
        userId: 'server-held-static-grant',
        email: 'server-held-static-grant@local.invalid',
        clientId: 'static-compatibility-client',
        authMode: 'static',
      };
    }

    const body = req.body as unknown;
    const id = isRecord(body) ? rpcId(body.id) : null;
    if (!isRecord(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      res.status(400).json(rpcError(id, -32600, 'Invalid JSON-RPC request'));
      return;
    }

    const requestedProtocol = protocolForRequest(req, body);
    if (requestedProtocol && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requestedProtocol)) {
      res.status(400).json(rpcError(id, -32022, 'Unsupported protocol version', {
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested: requestedProtocol,
      }));
      return;
    }

    const modern = requestedProtocol === MODERN_PROTOCOL_VERSION;
    if (modern) {
      const headerError = validateModernRequest(req, body);
      if (headerError) {
        res.status(400).json(headerError);
        return;
      }
      if (body.id === null) {
        res.status(400).json(rpcError(null, -32600, 'Modern MCP request IDs cannot be null'));
        return;
      }
      const accept = req.header('accept') ?? '';
      if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
        res.status(406).json(rpcError(id, -32600, 'Accept must include application/json and text/event-stream'));
        return;
      }
    }

    if (body.id === undefined) {
      res.status(202).send();
      return;
    }

    if (body.method === 'server/discover') {
      if (!modern) {
        res.status(404).json(rpcError(id, -32601, 'server/discover requires MCP 2026-07-28'));
        return;
      }
      res.json(rpcResult(id, modernResult({
        supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        capabilities: { tools: {} },
        instructions:
          'Paired Chief AI + Founder Control Room connector. It exposes six read/preview-only tools, fails closed on auth/scope/evidence errors, stores no raw MCP arguments or results, and grants no execution authority.',
      }, { ttlMs: 300_000, cacheScope: 'private' })));
      return;
    }

    if (body.method === 'initialize') {
      if (modern) {
        res.status(404).json(rpcError(id, -32601, 'initialize is not part of MCP 2026-07-28'));
        return;
      }
      const params = isRecord(body.params) ? body.params : null;
      res.json(rpcResult(id, {
        protocolVersion: supportedLegacyVersion(params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'Paired Chief AI + Founder Control Room connector. Six read/preview-only tools; no generic nested invocation, provider mutation, credential input, cookies, fingerprinting, or execution authority.',
      }));
      return;
    }

    if (!modern && body.method === 'ping') {
      res.json(rpcResult(id, {}));
      return;
    }

    if (body.method === 'tools/list') {
      const result: JsonRecord = { tools: externalMcpToolDefinitions() };
      res.json(rpcResult(id, modern
        ? modernResult(result, { ttlMs: 300_000, cacheScope: 'private' })
        : result));
      return;
    }

    if (body.method !== 'tools/call') {
      res.status(404).json(rpcError(id, -32601, `Method not found: ${body.method}`));
      return;
    }

    const params = isRecord(body.params) ? body.params : null;
    const name = boundedString(params?.name, 160);
    const args = params?.arguments === undefined ? {} : params.arguments;
    if (!isExternalMcpToolName(name) || !isRecord(args)) {
      res.status(400).json(rpcError(id, -32602, 'Unknown tool or invalid arguments object'));
      return;
    }

    try {
      assertNoSecretArguments(args);
      const value = await executeTool({
        name,
        arguments: args,
        allowedProjects,
        identity,
        requestId: String(id),
      });
      res.json(rpcResult(id, toolResult(value, modern)));
    } catch (error) {
      const failure = toolFailure(error);
      res.status(failure.status).json(rpcError(id, failure.code, failure.message));
    }
  };
}

export function createRemoteMcpProtectedResourceMetadataHandler(
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (_req, res) => {
    applyMcpHeaders(res);
    const issuer = authorizationIssuer(env);
    if (!issuer) {
      res.status(503).json({ error: 'OAuth issuer is not configured' });
      return;
    }
    try {
      const resource = configuredResource(env).toString();
      res.status(200).json({
        resource,
        authorization_servers: [issuer],
        scopes_supported: [env.FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE?.trim() || 'mcp:read'],
        bearer_methods_supported: ['header'],
        resource_name: 'Founder Control Room paired MCP',
        resource_documentation: 'https://github.com/jussray/founder-control-room/blob/main/docs/MCP_STACK.md',
      });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

// Compatibility lane for existing server-held static-token clients.
export const handleRemoteReadMcp = createRemoteReadMcpHandler({ authMode: 'static' });
// Canonical ChatGPT/Claude lane. It cannot start until Supabase OAuth claims,
// client IDs, audience, project grants, and the live evidence ledger are configured.
export const handlePairedRemoteMcp = createRemoteReadMcpHandler({ authMode: 'oauth' });
export const handleRemoteMcpProtectedResourceMetadata =
  createRemoteMcpProtectedResourceMetadataHandler();
