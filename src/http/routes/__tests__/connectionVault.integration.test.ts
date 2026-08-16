import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { issueFcrApiToken } from '../../../connectionVault/tokens.js';
import { connectionVaultRouter } from '../connectionVault.js';

const FOUNDER_EMAIL = 'founder@example.com';
const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_SLUG = 'founder-control-room';
const CONNECTION_ID = '00000000-0000-4000-8000-000000000002';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/mcp/vault', connectionVaultRouter);
  return instance;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function projectRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room' },
          error: null,
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Connection Vault founder administration', () => {
  it('issues a token once while persisting only its SHA-256 hash and prefix', async () => {
    authSuccess();
    let inserted: Record<string, unknown> | undefined;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectRow();
      if (table === 'fcr_api_tokens') {
        return {
          insert: (value: Record<string, unknown>) => {
            inserted = value;
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: {
                    id: 'token-id',
                    ...value,
                    revoked_at: null,
                    rotated_at: null,
                    last_used_at: null,
                    usage_count: 0,
                    created_at: '2026-08-16T09:00:00.000Z',
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      return {};
    });

    const res = await request(app())
      .post('/mcp/vault/tokens')
      .set('Authorization', 'Bearer founder-session')
      .send({
        projectSlug: PROJECT_SLUG,
        name: 'Chief production resolver',
        environment: 'production',
        scopes: ['connections:resolve'],
        expiresInMinutes: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^fcr_prd_/);
    expect(res.body.shownOnce).toBe(true);
    expect(inserted?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted?.token_prefix).toBe(res.body.token.slice(0, 20));
    expect(inserted).not.toHaveProperty('token');
    expect(JSON.stringify(inserted)).not.toContain(res.body.token);
    expect(res.body.tokenMetadata).not.toHaveProperty('tokenHash');
  });

  it('rejects raw secret material and accepts only opaque secretRef metadata', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const res = await request(app())
      .post('/mcp/vault/bindings')
      .set('Authorization', 'Bearer founder-session')
      .send({
        projectSlug: PROJECT_SLUG,
        connectionId: CONNECTION_ID,
        environment: 'production',
        name: 'CLOUDFLARE_API_TOKEN',
        kind: 'secret',
        storageProvider: 'cloudflare-secrets-store',
        secretValue: 'must-never-enter-fcr',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('raw credential values are not accepted');
  });
});

describe('GET /mcp/vault/resolve workflow API', () => {
  it('requires an FCR API bearer token', async () => {
    const res = await request(app()).get('/mcp/vault/resolve?projectId=founder-control-room&environment=production&capability=inspect_repos');
    expect(res.status).toBe(401);
  });

  it('returns variables and secret configured-state without returning secret references', async () => {
    const issued = issueFcrApiToken('production');
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'fcr_api_tokens') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  id: 'token-id',
                  project_id: PROJECT_ID,
                  name: 'Chief resolver',
                  environment: 'production',
                  token_prefix: issued.tokenPrefix,
                  scopes: ['connections:resolve'],
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  revoked_at: null,
                  usage_count: 0,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'projects') return projectRow();
      if (table === 'project_connections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                contains: () => Promise.resolve({
                  data: [{
                    id: CONNECTION_ID,
                    connection_type: 'github',
                    label: 'production',
                    status: 'active',
                    authority_level: 'L1',
                    capabilities: ['inspect_repos'],
                    data_boundary: 'Repository evidence only',
                    required_approval: null,
                    config: { apiBase: 'https://api.github.com' },
                  }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'connection_vault_bindings') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                eq: () => Promise.resolve({
                  data: [
                    {
                      id: 'binding-secret',
                      project_id: PROJECT_ID,
                      connection_id: CONNECTION_ID,
                      environment: 'production',
                      name: 'MCP_GITHUB_TOKEN',
                      kind: 'secret',
                      storage_provider: 'cloudflare-secrets-store',
                      secret_ref: 'cloudflare-secrets-store://store/github-token',
                      variable_value: null,
                      status: 'active',
                    },
                    {
                      id: 'binding-variable',
                      project_id: PROJECT_ID,
                      connection_id: CONNECTION_ID,
                      environment: 'production',
                      name: 'MCP_GITHUB_URL',
                      kind: 'variable',
                      storage_provider: 'fcr-variable',
                      secret_ref: null,
                      variable_value: 'https://api.githubcopilot.com/mcp/',
                      status: 'active',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await request(app())
      .get('/mcp/vault/resolve?projectId=founder-control-room&environment=production&capability=inspect_repos')
      .set('Authorization', `Bearer ${issued.token}`);

    expect(res.status).toBe(200);
    expect(res.body.credentialBoundary).toEqual({
      rawCredentialsReturned: false,
      secretReferencesReturned: false,
      secretResolution: 'fcr-internal-only',
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('cloudflare-secrets-store://store/github-token');
    expect(serialized).not.toContain('"secretRef":');
    expect(serialized).not.toContain(issued.token);
    expect(res.body.connections[0].bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'MCP_GITHUB_TOKEN', kind: 'secret', configured: true }),
      expect.objectContaining({ name: 'MCP_GITHUB_URL', kind: 'variable', value: 'https://api.githubcopilot.com/mcp/' }),
    ]));
    expect(supabaseMock.rpc).toHaveBeenCalledWith('record_fcr_api_token_usage', expect.objectContaining({
      p_token_id: 'token-id',
      p_project_id: PROJECT_ID,
      p_capability: 'inspect_repos',
      p_connection_count: 1,
    }));
  });
});
