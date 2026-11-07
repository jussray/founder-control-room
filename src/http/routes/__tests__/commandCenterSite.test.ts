import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  memberships: [] as Record<string, unknown>[],
  projects: [] as Record<string, unknown>[],
  failedTable: '',
}));
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: state.getUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: state.from },
}));

import { commandCenterSiteRouter } from '../commandCenterSite.js';
import { COMMAND_CENTER_SITE_RESOURCE } from '../../../auth/commandCenterSiteAccess.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const USER_A = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';
const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROJECT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const jwt = (sub: string, overrides: Record<string, unknown> = {}) =>
  'header.' + Buffer.from(JSON.stringify({
    iss: 'https://example.supabase.co/auth/v1',
    aud: 'authenticated',
    client_id: 'chatgpt-command-center',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub,
    ...overrides,
  })).toString('base64url') + '.signature';
function app() {
  const instance = express();
  instance.use(commandCenterSiteRouter);
  return instance;
}
const get = (id = USER_A, overrides: Record<string, unknown> = {}) =>
  request(app()).get('/site/command-center/bootstrap')
    .set('Authorization', 'Bearer ' + jwt(id, overrides));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.FCR_COMMAND_CENTER_SITE_ENABLED = 'true';
  process.env.FCR_COMMAND_CENTER_OWNER_USER_ID = OWNER;
  process.env.FCR_COMMAND_CENTER_OAUTH_CLIENT_IDS = 'chatgpt-command-center';
  state.failedTable = '';
  state.memberships = [
    { tenant_id: TENANT_A, user_id: USER_A, status: 'active' },
    { tenant_id: TENANT_B, user_id: USER_B, status: 'active' },
  ];
  state.projects = [
    { id: PROJECT_A, tenant_id: TENANT_A, name: 'A own work', status: 'new', observed_at: null },
    { id: PROJECT_B, tenant_id: TENANT_B, name: 'B own work', status: 'new', observed_at: null },
  ];
  state.getUser.mockImplementation(async (token: string) => {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return { data: { user: {
      id: claims.sub, email: claims.sub === OWNER ? 'owner@example.test' : 'customer@example.test',
      is_anonymous: false,
    } }, error: null };
  });
  state.from.mockImplementation((table: string) => {
    if (!['founder_users', 'fcr_public_memberships', 'fcr_public_projects'].includes(table)) {
      throw new Error('Forbidden private table: ' + table);
    }
    const predicates: Array<[string, unknown]> = [];
    const rows = () => table === 'founder_users'
      ? [{ user_id: OWNER }]
      : table === 'fcr_public_memberships' ? state.memberships : state.projects;
    const selected = () => rows().filter(row => predicates.every(([key, value]) => (row as Record<string, unknown>)[key] === value));
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { predicates.push([column, value]); return query; },
      order: () => query,
      limit: async (max: number) => state.failedTable === table
        ? { data: null, error: { message: 'unavailable' } }
        : { data: selected().slice(0, max), error: null },
      maybeSingle: async () => ({ data: selected()[0] ?? null, error: null }),
    };
    return query;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.FCR_COMMAND_CENTER_SITE_ENABLED;
  delete process.env.FCR_COMMAND_CENTER_OWNER_USER_ID;
  delete process.env.FCR_COMMAND_CENTER_OAUTH_CLIENT_IDS;
});

describe('command center Site authorization membrane', () => {
  it('starts disabled and does not query identity or database', async () => {
    delete process.env.FCR_COMMAND_CENTER_SITE_ENABLED;
    expect((await get()).status).toBe(503);
    expect(state.getUser).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });
  it('requires resource-bound, provider-verified bearer authentication', async () => {
    expect((await request(app()).get('/site/command-center/bootstrap')).status).toBe(401);
    expect((await get(USER_A, { resource: 'https://other.example/api' })).status).toBe(401);
    expect((await get(USER_A, { client_id: 'attacker' })).status).toBe(401);
    expect((await get(USER_A, { aud: 'some-other-api' })).status).toBe(401);
    expect(state.getUser).not.toHaveBeenCalled();
  });
  it('returns only a first-party owner link for exact owner identity plus allowlist', async () => {
    const response = await get(OWNER);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      account: 'owner', externalFounderData: false, executionAuthorized: false,
    });
    expect(response.body).not.toHaveProperty('workspace');
    expect(state.from).toHaveBeenCalledWith('founder_users');
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it('owner account without immutable founder_users binding is rejected', async () => {
    state.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }));
    const response = await get(OWNER);
    expect(response.status).toBe(401);
  });
  it('customer A cannot read customer B or founder projects', async () => {
    const response = await get(USER_A);
    expect(response.status).toBe(200);
    expect(response.body.account).toBe('customer');
    expect(response.body.workspace.projects).toHaveLength(1);
    expect(response.body.workspace.projects[0].projectId).toBe(PROJECT_A);
    expect(JSON.stringify(response.body)).not.toContain(PROJECT_B);
    expect(JSON.stringify(response.body)).not.toContain('owner@example.test');
    expect(state.from).not.toHaveBeenCalledWith('founder_users');
  });
  it('new customers have an actual empty workspace, not inherited founder state', async () => {
    const response = await get('44444444-4444-4444-8444-444444444444');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      account: 'customer', workspace: { projects: [] },
      inheritedFounderContext: false, executionAuthorized: false,
    });
  });
  it('storage failure never turns into a fake empty success', async () => {
    state.failedTable = 'fcr_public_memberships';
    const response = await get(USER_A);
    expect(response.status).toBe(503);
    expect(response.body.workspace).toBeUndefined();
  });
});
