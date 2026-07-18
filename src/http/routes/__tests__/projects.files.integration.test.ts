import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, mockGetProject, mockListFiles, mockReadFile } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockGetProject: vi.fn(),
  mockListFiles: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

vi.mock('../../../providers/GitHubProvider.js', () => ({
  GitHubProvider: class MockGitHubProvider {
    getProject = mockGetProject;
    listFiles = mockListFiles;
    readFile = mockReadFile;
  },
}));

import express from 'express';
import request from 'supertest';
import { projectsRouter } from '../projects.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'user-uuid-001';
const BEARER = 'Bearer test-token';
const PROJECT_SLUG = 'sekret-bip';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
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

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: {
            id: 'project-1',
            slug: PROJECT_SLUG,
            repo_provider: 'github',
            repo_identifier: 'jussray/Sekret-Bip',
            ...overrides,
          },
          error: null,
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['GITHUB_TOKEN'] = 'test-token';
  mockGetProject.mockResolvedValue({ defaultBranch: 'main' });
});

describe('GET /projects/:slug/files', () => {
  it('rejects unauthenticated requests', async () => {
    const app = buildApp();
    const res = await request(app).get(`/projects/${PROJECT_SLUG}/files`);
    expect(res.status).toBe(401);
  });

  it('lists files at the live default branch when ref is omitted', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectRow();
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });
    mockListFiles.mockResolvedValue([{ path: 'src', type: 'dir' }]);

    const app = buildApp();
    const res = await request(app).get(`/projects/${PROJECT_SLUG}/files`).set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('main');
    expect(mockListFiles).toHaveBeenCalledWith(PROJECT_SLUG, 'main', '');
  });

  it('returns 404 for an unregistered project', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app).get('/projects/no-such-project/files').set('Authorization', BEARER);
    expect(res.status).toBe(404);
  });
});

describe('GET /projects/:slug/file', () => {
  it('requires a path query parameter', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const app = buildApp();
    const res = await request(app).get(`/projects/${PROJECT_SLUG}/file`).set('Authorization', BEARER);
    expect(res.status).toBe(400);
  });

  it('reads file content at a pinned ref', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectRow();
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });
    mockReadFile.mockResolvedValue('console.log("hi")');

    const app = buildApp();
    const res = await request(app)
      .get(`/projects/${PROJECT_SLUG}/file`)
      .query({ path: 'src/index.ts', ref: 'feature/x' })
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('console.log("hi")');
    expect(mockReadFile).toHaveBeenCalledWith(PROJECT_SLUG, 'feature/x', 'src/index.ts');
    expect(mockGetProject).not.toHaveBeenCalled();
  });
});
