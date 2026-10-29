import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: { memberships: [] as Record<string, unknown>[], projects: [] as Record<string, unknown>[] },
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: state.getUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: state.from },
}));

import { publicMcpRouter } from '../publicMcp.js';
import { FCR_PUBLIC_MCP_RESOURCE } from '../../../mcp/publicMcpAuth.js';

function jwt(subject: string, clientId = 'chatgpt-public', overrides: Record<string, unknown> = {}) {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64({
    iss: 'https://example.supabase.co/auth/v1',
    aud: 'authenticated', resource: FCR_PUBLIC_MCP_RESOURCE, scope: 'openid',
    sub: subject, client_id: clientId,
    exp: Math.floor(Date.now() / 1000) + 3600, ...overrides,
  })}.test-signature`;
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use(publicMcpRouter);
  return instance;
}

function post(server: ReturnType<typeof app>, userId = 'user-A', body: unknown = {
  jsonrpc: '2.0', id: 1, method: 'tools/list',
}) {
  return request(server).post('/mcp/public')
    .set('Authorization', `Bearer ${jwt(userId)}`)
    .send(body as object);
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.FCR_PUBLIC_MCP_OAUTH_CLIENT_IDS = 'chatgpt-public';
  process.env.FCR_PUBLIC_MCP_ENABLED = 'true';
  state.getUser.mockImplementation(async (token: string) => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return { data: { user: { id: payload.sub, is_anonymous: false } }, error: null };
  });
  state.rows.memberships = [
    { tenant_id: TENANT_A, user_id: 'user-A', status: 'active' },
    { tenant_id: TENANT_B, user_id: 'user-B', status: 'active' },
  ];
  state.rows.projects = [
    { id: PROJECT_A, tenant_id: TENANT_A, name: 'A project', status: 'observed', observed_at: null },
    { id: PROJECT_B, tenant_id: TENANT_B, name: 'B project', status: 'observed', observed_at: null },
  ];
  state.from.mockImplementation((table: string) => {
    if (table !== 'fcr_public_memberships' && table !== 'fcr_public_projects') {
      throw new Error('Forbidden founder database read');
    }
    const filters: Array<[string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      order: () => query,
      limit: async (n: number) => ({ data: selected().slice(0, n), error: null }),
      maybeSingle: async () => ({ data: selected()[0] ?? null, error: null }),
    };
    const selected = () => (table === 'fcr_public_memberships'
      ? state.rows.memberships : state.rows.projects).filter((row) =>
      filters.every(([key, value]) => row[key] === value));
    return query;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.FCR_PUBLIC_MCP_ENABLED;
  delete process.env.FCR_PUBLIC_MCP_OAUTH_CLIENT_IDS;
});

describe('public FCR MCP isolation', () => {
  it('fails closed when the public feature is not activated', async () => {
    delete process.env.FCR_PUBLIC_MCP_ENABLED;
    const response = await post(app());
    expect(response.status).toBe(503);
    expect(state.getUser).not.toHaveBeenCalled();
  });

  it('returns only two read-only, OAuth-scoped tools', async () => {
    const response = await post(app());
    expect(response.status).toBe(200);
    expect(response.body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'fcr_list_my_projects', 'fcr_get_my_project',
    ]);
    expect(response.body.result.tools.every((t: { annotations: { readOnlyHint: boolean } }) =>
      t.annotations.readOnlyHint)).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/fcr_relay_operator|founder_users/);
  });

  it('shows user A only projects under user A memberships', async () => {
    const response = await post(app(), 'user-A', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'fcr_list_my_projects', arguments: {} },
    });
    expect(response.status).toBe(200);
    expect(response.body.result.structuredContent.projects).toHaveLength(1);
    expect(response.body.result.structuredContent.projects[0].projectId).toBe(PROJECT_A);
    expect(JSON.stringify(response.body)).not.toContain('B project');
  });

  it('does not leak a project by guessing another tenant UUID', async () => {
    const response = await post(app(), 'user-A', {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'fcr_get_my_project', arguments: { projectId: PROJECT_B } },
    });
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('B project');
    expect(JSON.stringify(response.body)).not.toContain(TENANT_B);
  });

  it('blocks a regular Supabase access token without an OAuth client binding', async () => {
    const token = jwt('user-A', 'unregistered-client');
    const response = await request(app()).post('/mcp/public')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
    expect(state.getUser).not.toHaveBeenCalled();
  });

  it('rejects unbound generic audience tokens before calling Supabase', async () => {
    const token = jwt('user-A', 'chatgpt-public', { resource: undefined });
    const response = await request(app()).post('/mcp/public')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('resource_metadata=');
    expect(state.getUser).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it('rejects foreign resources, missing openid, and future-dated tokens', async () => {
    for (const overrides of [
      { resource: 'https://elsewhere.example/mcp' },
      { scope: 'profile' },
      { nbf: Math.floor(Date.now() / 1000) + 7200 },
      { aud: 'https://elsewhere.example/mcp' },
    ]) {
      const token = jwt('user-A', 'chatgpt-public', overrides);
      const response = await request(app()).post('/mcp/public')
        .set('Authorization', `Bearer ${token}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(response.status).toBe(401);
    }
    expect(state.getUser).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it('rejects deceptive resource URL substrings before authentication and database access', async () => {
    const deceptive = [
      `https://attacker.example/redirect?next=${FCR_PUBLIC_MCP_RESOURCE}`,
      `${FCR_PUBLIC_MCP_RESOURCE}/extra`,
      `${FCR_PUBLIC_MCP_RESOURCE}.attacker.example`,
      FCR_PUBLIC_MCP_RESOURCE.replace('https:', 'http:'),
    ];
    for (const address of deceptive) {
      for (const overrides of [
        { aud: address, resource: undefined },
        { aud: ['authenticated', address], resource: undefined },
        { aud: 'authenticated', resource: address },
      ]) {
        const response = await request(app()).post('/mcp/public')
          .set('Authorization', `Bearer ${jwt('user-A', 'chatgpt-public', overrides)}`)
          .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(response.status).toBe(401);
      }
    }
    expect(state.getUser).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it('refuses anonymous users, even with a matching client claim', async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: 'user-A', is_anonymous: true } }, error: null });
    expect((await post(app())).status).toBe(401);
  });

  it('never makes a provider call when asked to merge or relay', async () => {
    const response = await post(app(), 'user-A', {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'fcr_relay_operator', arguments: { targetOperator: 'chief' } },
    });
    expect(response.status).toBe(400);
    expect(state.from).not.toHaveBeenCalled();
  });
});
