import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.founder = { email: 'founder@example.com', userId: 'founder-user-1' };
    next();
  },
}));
vi.mock('../../../providers/providerFactory.js', () => ({ providerForProject: vi.fn() }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import { projectsRouter } from '../projects.js';

const RAW_VALUE = 'raw-provider-credential-value';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/projects', projectsRouter);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    throw new Error(`unexpected table access: ${table}`);
  });
});

describe('POST /projects/:slug/connections raw-credential boundary', () => {
  it.each([
    [{ account: 'production', auth: { apiKey: RAW_VALUE } }, 'config.auth.apiKey'],
    [{ note: `-----BEGIN PRIVATE KEY-----\n${RAW_VALUE}` }, 'config.note'],
    [{ endpoint: `Bearer ${RAW_VALUE}` }, 'config.endpoint'],
  ])('rejects %j before any database access and never echoes the value', async (config, field) => {
    const response = await request(app())
      .post('/projects/founder-control-room/connections')
      .send({ connectionType: 'cloudflare', config, secretRef: 'CLOUDFLARE_API_TOKEN' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({
      code: 'CONNECTION_CONFIG_SECRET_REJECTED',
      field,
    }));
    expect(response.body.error).toContain('secretRef');
    expect(JSON.stringify(response.body)).not.toContain(RAW_VALUE);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('rejects a raw credential passed as secretRef', async () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const response = await request(app())
      .post('/projects/founder-control-room/connections')
      .send({ connectionType: 'github', config: {}, secretRef: token });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({
      code: 'CONNECTION_CONFIG_SECRET_REJECTED',
      field: 'secretRef',
    }));
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('accepts nested non-secret metadata plus an opaque secretRef', async () => {
    let inserted: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
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
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'conn-1', ...row }, error: null }) }) };
          },
        };
      }
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      throw new Error(`unexpected table access: ${table}`);
    });

    const config = {
      apiBase: 'https://api.github.com',
      oauth: { tokenEndpoint: 'https://github.com/login/oauth/access_token' },
    };
    const response = await request(app())
      .post('/projects/founder-control-room/connections')
      .send({ connectionType: 'github', config, secretRef: 'GITHUB_APP_PRIVATE_KEY' });

    expect(response.status).toBe(201);
    expect(inserted).toMatchObject({ connection_type: 'github', config, secret_ref: 'GITHUB_APP_PRIVATE_KEY' });
  });
});
