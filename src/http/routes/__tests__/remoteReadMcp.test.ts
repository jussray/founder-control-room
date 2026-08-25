import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));
vi.mock('../../../mcp/hub.js', () => ({
  McpHub: class {},
}));
vi.mock('../../../mcp/vaultHub.js', () => ({
  hubForMcpProject: vi.fn(),
}));

import {
  createRemoteMcpProtectedResourceMetadataHandler,
  createRemoteReadMcpHandler,
  verifyRemoteMcpOauthToken,
  type RemoteReadMcpDependencies,
} from '../remoteReadMcp.js';

const ENDPOINT = '/mcp';
const TOKEN = 'test-fcr-read-token';
const CHIEF = 'chief-ai-machine';
const FCR = 'founder-control-room';
const RESOURCE = 'https://api.foundercontrolroom.org/mcp';

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function modernRpc(method: string, params: Record<string, unknown> = {}, id: string | number = 1) {
  return rpc(method, {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
    },
  }, id);
}

function receipt(toolName = 'fcr_list_projects', projectSlug = FCR) {
  return {
    contract: 'founder-control-room/external-mcp-receipt@v1' as const,
    id: 'evidence-1',
    projectSlug,
    toolName: toolName as never,
    requestHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    createdAt: '2026-08-25T00:00:00.000Z',
    privacy: {
      cookiesUsed: false as const,
      fingerprintsUsed: false as const,
      rawArgumentsStored: false as const,
      rawResultStored: false as const,
    },
  };
}

function jwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.test-signature`;
}

function oauthEnv(): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: 'https://oojzfmmywbvficgybaxd.supabase.co',
    FCR_REMOTE_MCP_OAUTH_AUDIENCE: RESOURCE,
    FCR_REMOTE_MCP_OAUTH_CLIENT_IDS: 'chatgpt-client,claude-client',
    FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE: 'mcp:read',
  };
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://oojzfmmywbvficgybaxd.supabase.co/auth/v1',
    aud: RESOURCE,
    sub: 'founder-user-1',
    client_id: 'chatgpt-client',
    scope: 'openid mcp:read',
    mcp_projects: [CHIEF, FCR],
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function dependencies(overrides: RemoteReadMcpDependencies = {}): RemoteReadMcpDependencies {
  return {
    authMode: 'static',
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://oojzfmmywbvficgybaxd.supabase.co',
      FCR_REMOTE_MCP_RESOURCE: RESOURCE,
      FCR_REMOTE_MCP_READ_TOKEN: TOKEN,
      FCR_REMOTE_MCP_READ_PROJECTS: `${CHIEF},${FCR}`,
    },
    listProjects: vi.fn(async () => [{ slug: CHIEF }, { slug: FCR }]),
    listCapabilities: vi.fn(async () => ({ project: CHIEF, capabilities: [] })),
    getCurrentTruth: vi.fn(async (projectId) => ({ projectId, exactTarget: null })),
    previewCapabilityPlan: vi.fn(async () => ({ data: { executionAuthorized: false } })),
    previewSkillRoute: vi.fn((input) => ({
      contract: 'juss/fcr-skill-router@v1',
      status: 'ready_for_runtime_discovery',
      executionAllowed: false,
      input,
    })),
    invokeReadTool: vi.fn(async (input) => ({
      ...input,
      policy: { decision: 'allow', risk: 'read' },
      evidenceId: 'proofmode-evidence-1',
      result: { ok: true },
    })),
    recordEvidence: vi.fn(async (input) => receipt(input.toolName, input.projectSlug)),
    ...overrides,
  };
}

function buildApp(overrides: RemoteReadMcpDependencies = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.post(ENDPOINT, createRemoteReadMcpHandler(dependencies(overrides)));
  return app;
}

function legacyPost(app: express.Express, body: unknown, token = TOKEN) {
  return request(app)
    .post(ENDPOINT)
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send(body as object);
}

function modernPost(
  app: express.Express,
  body: Record<string, unknown>,
  options: { methodHeader?: string; nameHeader?: string; token?: string } = {},
) {
  const operation = options.methodHeader ?? String(body.method);
  let call = request(app)
    .post(ENDPOINT)
    .set('Authorization', `Bearer ${options.token ?? TOKEN}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('MCP-Protocol-Version', '2026-07-28')
    .set('Mcp-Method', operation);
  if (options.nameHeader) call = call.set('Mcp-Name', options.nameHeader);
  return call.send(body);
}

describe('Supabase OAuth token verifier', () => {
  it('accepts only a current user and founder allowlist row after claim checks', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'founder-user-1', email: 'founder@example.com' } },
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { email: 'founder@example.com' }, error: null }),
        }),
      }),
    });

    await expect(verifyRemoteMcpOauthToken(jwt(validClaims()), oauthEnv())).resolves.toEqual({
      userId: 'founder-user-1',
      email: 'founder@example.com',
      clientId: 'chatgpt-client',
      projectIds: [CHIEF, FCR],
      authMode: 'oauth',
    });
  });

  it.each([
    ['issuer', { iss: 'https://attacker.example/auth/v1' }, 'issuer'],
    ['audience', { aud: 'https://attacker.example/mcp' }, 'audience'],
    ['client', { client_id: 'unknown-client' }, 'client'],
    ['expiry', { exp: Math.floor(Date.now() / 1000) - 1 }, 'expired'],
    ['scope', { scope: 'openid' }, 'scope'],
    ['project grant', { mcp_projects: [] }, 'project grant'],
  ])('rejects a token with the wrong %s before Supabase data access', async (_label, overrides, message) => {
    mockGetUser.mockClear();
    mockFrom.mockClear();
    await expect(
      verifyRemoteMcpOauthToken(jwt(validClaims(overrides)), oauthEnv()),
    ).rejects.toThrow(message);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a revoked token even when its decoded claims look valid', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('revoked') });
    await expect(
      verifyRemoteMcpOauthToken(jwt(validClaims()), oauthEnv()),
    ).rejects.toThrow('invalid or revoked');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('Founder Control Room paired remote MCP', () => {
  it('returns a protected-resource challenge when bearer auth is missing', async () => {
    const response = await request(buildApp()).post(ENDPOINT).send(rpc('tools/list'));
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain(
      'resource_metadata="https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp"',
    );
    expect(response.body.error.message).toBe('Unauthorized');
  });

  it('fails closed when the static compatibility token is not configured', async () => {
    const response = await legacyPost(buildApp({
      env: {
        FCR_REMOTE_MCP_RESOURCE: RESOURCE,
        FCR_REMOTE_MCP_READ_PROJECTS: `${CHIEF},${FCR}`,
      },
    }), rpc('tools/list'));

    expect(response.status).toBe(503);
    expect(response.body.error.message).toBe('Remote MCP static token is not configured');
  });

  it('publishes Supabase OAuth protected-resource metadata without cookies', async () => {
    const app = express();
    app.get('/.well-known/oauth-protected-resource/mcp',
      createRemoteMcpProtectedResourceMetadataHandler({
        SUPABASE_URL: 'https://oojzfmmywbvficgybaxd.supabase.co',
        FCR_REMOTE_MCP_RESOURCE: RESOURCE,
      }));

    const response = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      resource: RESOURCE,
      authorization_servers: ['https://oojzfmmywbvficgybaxd.supabase.co/auth/v1'],
      scopes_supported: ['mcp:read'],
      bearer_methods_supported: ['header'],
    });
    expect(response.headers).not.toHaveProperty('set-cookie');
  });

  it('keeps legacy initialization while advertising only six narrow tools', async () => {
    const app = buildApp();
    const initialized = await legacyPost(app, rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'legacy-test', version: '1.0.0' },
    }));
    const listed = await legacyPost(app, rpc('tools/list'));

    expect(initialized.status).toBe(200);
    expect(initialized.body.result.protocolVersion).toBe('2025-11-25');
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'chief_audit_repository',
      'chief_list_capabilities',
      'chief_preview_capability_plan',
      'fcr_list_projects',
      'fcr_get_current_truth',
      'fcr_preview_skill_route',
    ]);
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      'invoke_read_tool',
    );
  });

  it('implements modern stateless discovery with private cache hints', async () => {
    const body = modernRpc('server/discover');
    const response = await modernPost(buildApp(), body);

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      resultType: 'complete',
      supportedVersions: expect.arrayContaining(['2026-07-28', '2025-11-25']),
      capabilities: { tools: {} },
      ttlMs: 300000,
      cacheScope: 'private',
      _meta: {
        'io.modelcontextprotocol/serverInfo': {
          name: 'founder-control-room-paired',
          version: '0.2.0',
        },
      },
    });
  });

  it('rejects modern header/body routing mismatches', async () => {
    const response = await modernPost(
      buildApp(),
      modernRpc('tools/list'),
      { methodHeader: 'tools/call' },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(-32020);
  });

  it('rejects null request IDs on the modern protocol', async () => {
    const body = modernRpc('tools/list') as Record<string, unknown>;
    body.id = null;
    const response = await modernPost(buildApp(), body);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Modern MCP request IDs cannot be null');
  });

  it('routes only the namespaced Chief audit into fixed ProofMode authority', async () => {
    const invokeReadTool = vi.fn(async () => ({
      policy: { decision: 'allow', risk: 'read' },
      evidenceId: 'proofmode-evidence-1',
      result: { repository: 'jussray/chief-ai-machine' },
    }));
    const response = await legacyPost(buildApp({ invokeReadTool }), rpc('tools/call', {
      name: 'chief_audit_repository',
      arguments: { owner: 'jussray', repo: 'chief-ai-machine' },
    }));

    expect(response.status).toBe(200);
    expect(invokeReadTool).toHaveBeenCalledWith({
      serverId: 'proofmode',
      projectId: CHIEF,
      toolName: 'audit_repository',
      arguments: { owner: 'jussray', repo: 'chief-ai-machine' },
    });
    expect(response.body.result.structuredContent.governanceBoundary).toMatchObject({
      executionAllowed: false,
      cookiesUsed: false,
      fingerprintsUsed: false,
    });
  });

  it('intersects OAuth token projects with the server-held project scope', async () => {
    const getCurrentTruth = vi.fn(async () => ({ ok: true }));
    const app = buildApp({
      authMode: 'oauth',
      authenticateOauth: vi.fn(async (_token: string, _env: NodeJS.ProcessEnv) => ({
        userId: 'founder-user-1',
        email: 'founder@example.com',
        clientId: 'chatgpt-client',
        projectIds: [CHIEF],
        authMode: 'oauth' as const,
      })),
      getCurrentTruth,
    });
    const response = await modernPost(app, modernRpc('tools/call', {
      name: 'fcr_get_current_truth',
      arguments: { projectId: FCR },
    }), { nameHeader: 'fcr_get_current_truth' });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Requested project is outside this remote MCP grant');
    expect(getCurrentTruth).not.toHaveBeenCalled();
  });

  it('rejects nested secret-bearing arguments before any tool executes', async () => {
    const getCurrentTruth = vi.fn();
    const response = await legacyPost(buildApp({ getCurrentTruth }), rpc('tools/call', {
      name: 'fcr_get_current_truth',
      arguments: { projectId: CHIEF, nested: { api_key: 'must-never-cross' } },
    }));

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Secret-bearing argument key is not allowed');
    expect(getCurrentTruth).not.toHaveBeenCalled();
  });

  it('fails the read when the redacted evidence receipt cannot persist', async () => {
    const response = await legacyPost(buildApp({
      recordEvidence: vi.fn(async () => {
        throw new Error('evidence_persistence_unavailable:mcp_tool_calls missing');
      }),
    }), rpc('tools/call', {
      name: 'fcr_list_projects',
      arguments: {},
    }));

    expect(response.status).toBe(503);
    expect(response.body.error.message).toContain('evidence_persistence_unavailable');
  });

  it('rejects mutation actions from the skill-route preview surface', async () => {
    const response = await legacyPost(buildApp(), rpc('tools/call', {
      name: 'fcr_preview_skill_route',
      arguments: {
        projectId: CHIEF,
        goal: 'deploy the repo',
        action: 'deploy',
        expectedHeadSha: 'a'.repeat(40),
        expectedRegistryHash: 'b'.repeat(64),
        capabilityPlan: {},
      },
    }));

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('accepts only inspect, plan, review, or draft');
  });

  it('rejects oversized requests before tool dispatch', async () => {
    const listProjects = vi.fn();
    const response = await legacyPost(buildApp({ listProjects }), rpc('tools/call', {
      name: 'fcr_list_projects',
      arguments: { padding: 'x'.repeat(70 * 1024) },
    }));

    expect(response.status).toBe(413);
    expect(listProjects).not.toHaveBeenCalled();
  });
});
