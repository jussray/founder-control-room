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
import { projectsRouter } from '../projects.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const PROJECT_SLUG = 'founder-control-room';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/projects', projectsRouter);
  return instance;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL } }, error: null });
}

function founderUsersRow() {
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('POST /projects/:slug/connections non-secret config boundary', () => {
  it('rejects nested credential-shaped config before any connection write', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      throw new Error(`unexpected table access: ${table}`);
    });

    const response = await request(app())
      .post(`/projects/${PROJECT_SLUG}/connections`)
      .set('Authorization', BEARER)
      .send({
        connectionType: 'cloudflare',
        config: {
          account: 'production',
          auth: { apiKey: 'raw-provider-credential' },
        },
        secretRef: 'CLOUDFLARE_API_TOKEN',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('non-secret metadata only');
    expect(response.body.error).toContain('secretRef');
    expect(supabaseMock.from).not.toHaveBeenCalledWith('project_connections');
  });

  it('rejects obvious private-key material even when hidden under an innocuous key', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      throw new Error(`unexpected table access: ${table}`);
    });

    const response = await request(app())
      .post(`/projects/${PROJECT_SLUG}/connections`)
      .set('Authorization', BEARER)
      .send({
        connectionType: 'github',
        config: { note: '-----BEGIN PRIVATE KEY-----\nredacted' },
      });

    expect(response.status).toBe(400);
    expect(supabaseMock.from).not.toHaveBeenCalledWith('project_connections');
  });

  it('continues to accept nested non-secret metadata plus an opaque secretRef', async () => {
    authSuccess();
    let inserted: Record<string, unknown> | null = null;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'project-1' }, error: null }) }),
          }),
        };
      }
      if (table === 'project_connections') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted = row;
            return {
              select: () => ({ single: () => Promise.resolve({ data: { id: 'conn-1', ...row }, error: null }) }),
            };
          },
        };
      }
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });

    const response = await request(app())
      .post(`/projects/${PROJECT_SLUG}/connections`)
      .set('Authorization', BEARER)
      .send({
        connectionType: 'github',
        config: {
          apiBase: 'https://api.github.com',
          oauth: { tokenEndpoint: 'https://github.com/login/oauth/access_token' },
        },
        secretRef: 'GITHUB_APP_PRIVATE_KEY',
      });

    expect(response.status).toBe(201);
    expect(inserted).toMatchObject({
      connection_type: 'github',
      config: {
        apiBase: 'https://api.github.com',
        oauth: { tokenEndpoint: 'https://github.com/login/oauth/access_token' },
      },
      secret_ref: 'GITHUB_APP_PRIVATE_KEY',
    });
  });
});
