import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { pluginCenterRouter } from '../pluginCenter.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'user-uuid-001';
const BEARER = 'Bearer test-token';
const PROJECT_ID = 'project-uuid-001';
const PROJECT_SLUG = 'founder-control-room';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/plugin-center', pluginCenterRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
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

describe('Plugin Center auth gate', () => {
  it('rejects unauthenticated requests', async () => {
    const app = buildApp();
    const res = await request(app).get('/plugin-center');
    expect(res.status).toBe(401);
  });
});

describe('GET /plugin-center', () => {
  it('returns only unexpired temporary grants without allowing founder state to be cached', async () => {
    authSuccess();
    const gt = vi.fn();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'project_connections') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [
                {
                  id: 'connection-1',
                  project_id: PROJECT_ID,
                  connection_type: 'github',
                  label: 'repository',
                  status: 'active',
                  authority_level: 'L5',
                  capabilities: ['inspect_repos', 'create_branch', 'integrate_main'],
                  data_boundary: 'Repository metadata and PR evidence only.',
                  required_approval: 'proof_gate',
                  secret_ref: 'GITHUB_TOKEN',
                  last_checked_at: '2026-07-19T18:00:00.000Z',
                  updated_at: '2026-07-19T18:00:00.000Z',
                  projects: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room' },
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'plugin_permission_grants') {
        const grantResult = Promise.resolve({
          data: [
            {
              id: 'grant-1',
              project_id: PROJECT_ID,
              connection_id: 'connection-1',
              grant_type: 'tool_rule',
              tool_rule: 'Bash(git push origin main)',
              reason: 'Temporary founder-approved integration window',
              requested_by: FOUNDER_EMAIL,
              usage_limit: 'Use only after evidence is preserved.',
              expires_at: '2099-07-20T18:00:00.000Z',
              revoked_at: null,
              created_at: '2026-07-19T18:00:00.000Z',
              projects: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room' },
            },
          ],
          error: null,
        });
        const ordered = { limit: () => grantResult };
        gt.mockImplementation(() => ({ order: () => ordered }));
        return {
          select: () => ({
            is: () => ({
              order: () => ordered,
              gt,
            }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app).get('/plugin-center').set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(gt).toHaveBeenCalledTimes(1);
    expect(gt.mock.calls[0]?.[0]).toBe('expires_at');
    expect(Date.parse(String(gt.mock.calls[0]?.[1]))).toBeGreaterThan(0);
    expect(res.body.contract.id).toBe('founder-control-room-plugin-center');
    expect(res.body.contract.version).toBe('1.1.0');
    expect(res.body.catalog.some((plugin: { type: string }) => plugin.type === 'github')).toBe(true);

    const hubspot = res.body.catalog.find((plugin: { type: string }) => plugin.type === 'hubspot');
    expect(hubspot).toMatchObject({
      label: 'HubSpot',
      defaultAuthorityLevel: 'L6',
    });
    expect(hubspot.capabilities.some((capability: { id: string }) => capability.id === 'manage_crm_records')).toBe(true);
    expect(hubspot.blockedByDefault).toContain('create_or_update_without_confirmation');
    expect(hubspot.blockedByDefault).toContain('floating_task_without_association');

    const openai = res.body.catalog.find((plugin: { type: string }) => plugin.type === 'openai');
    expect(openai.label).toBe('OpenAI Platform / Developers');
    expect(openai.description).toContain('OpenAI Developers');
    expect(openai.blockedByDefault).toContain('create_or_rotate_key_without_gate');

    expect(res.body.summary).toMatchObject({
      installedConnections: 1,
      activeConnections: 1,
      highRiskConnections: 1,
      activeTemporaryGrants: 1,
    });
    expect(res.body.connections[0]).toMatchObject({
      type: 'github',
      projectSlug: PROJECT_SLUG,
      risk: 'high',
    });
  });
});

describe('POST /plugin-center/grants', () => {
  it('rejects malformed non-object request bodies instead of throwing', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/plugin-center/grants')
      .set('Authorization', BEARER)
      .send([]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('projectSlug is required');
  });

  it('rejects grants longer than 24 hours', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/plugin-center/grants')
      .set('Authorization', BEARER)
      .send({
        projectSlug: PROJECT_SLUG,
        toolRule: 'Bash(git push origin main)',
        durationHours: 25,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no more than 24 hours');
  });

  it('creates a temporary grant and writes an audit event', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectRow();
      if (table === 'plugin_permission_grants') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => Promise.resolve({
                data: {
                  ...row,
                  project_id: PROJECT_ID,
                  grant_type: 'tool_rule',
                  tool_rule: 'Bash(gh issue close:*)',
                  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/plugin-center/grants')
      .set('Authorization', BEARER)
      .send({
        projectSlug: PROJECT_SLUG,
        toolRule: 'Bash(gh issue close:*)',
        durationHours: 1,
        usageLimit: 'Close only issues whose evidence is preserved.',
      });

    expect(res.status).toBe(201);
    expect(res.body.grant.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('revokes a newly created grant when its audit receipt cannot be persisted', async () => {
    authSuccess();
    let insertedId = '';

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectRow();
      if (table === 'plugin_permission_grants') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedId = String(row.id ?? '');
            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null }),
              }),
            };
          },
          update: (row: Record<string, unknown>) => ({
            eq: (_field: string, id: string) => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { id, revoked_at: row.revoked_at },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return { insert: () => Promise.resolve({ error: { message: 'audit unavailable' } }) };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/plugin-center/grants')
      .set('Authorization', BEARER)
      .send({
        projectSlug: PROJECT_SLUG,
        toolRule: 'Bash(gh issue close:*)',
        durationHours: 1,
      });

    expect(res.status).toBe(500);
    expect(insertedId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body).toMatchObject({
      error: 'PLUGIN_GRANT_AUDIT_INCOMPLETE',
      detail: 'audit unavailable',
      grantId: insertedId,
      grantRevoked: true,
    });
    expect(Date.parse(String(res.body.revokedAt))).toBeGreaterThan(0);
  });

  it('keeps rollback failure separate when audit failure may leave a grant active', async () => {
    authSuccess();
    let insertedId = '';

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectRow();
      if (table === 'plugin_permission_grants') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedId = String(row.id ?? '');
            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null }),
              }),
            };
          },
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: null, error: { message: 'rollback unavailable' } }),
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return { insert: () => Promise.resolve({ error: { message: 'audit unavailable' } }) };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/plugin-center/grants')
      .set('Authorization', BEARER)
      .send({
        projectSlug: PROJECT_SLUG,
        toolRule: 'Bash(gh issue close:*)',
        durationHours: 1,
      });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: 'PLUGIN_GRANT_ROLLBACK_INCOMPLETE',
      detail: 'audit unavailable',
      rollbackError: 'rollback unavailable',
      grantId: insertedId,
      grantMayRemainActive: true,
    });
  });
});

describe('POST /plugin-center/grants/:grantId/revoke', () => {
  it('keeps revocation truth explicit when the audit write fails after the revoke', async () => {
    authSuccess();
    const revokedGrant = {
      id: 'grant-1',
      project_id: PROJECT_ID,
      revoked_at: '2026-09-14T04:00:00.000Z',
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'plugin_permission_grants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'grant-1', project_id: PROJECT_ID, revoked_at: null },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: revokedGrant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return { insert: () => Promise.resolve({ error: { message: 'audit unavailable' } }) };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/plugin-center/grants/grant-1/revoke')
      .set('Authorization', BEARER);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: 'PLUGIN_REVOKE_AUDIT_INCOMPLETE',
      detail: 'audit unavailable',
      revocationSucceeded: true,
      grant: { id: 'grant-1', project_id: PROJECT_ID },
    });
  });
});
